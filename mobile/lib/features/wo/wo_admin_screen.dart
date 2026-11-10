import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/kolom_pilih.dart';
import '../hartek/foto_rincian.dart';
import '../hartek/hartek_gaya.dart';
import '../insjar/insjar_header.dart';
import 'wo_bantu.dart';
import 'wo_foto_server.dart';
import 'wo_penerusan.dart';
import 'wo_selisih.dart';
import 'wo_pilih_tim.dart';
import 'wo_sinkron.dart';
import 'wo_teruskan.dart';
import '../../widgets/popup_berhasil.dart';
import '../../widgets/sisi_loader.dart';
import '../../widgets/refresh_sisi.dart';

/// v1.0.11 (permintaan Master Guswan 21 Okt 2026): Penerusan WO Temuan untuk admin (menu OPS_PENERUSAN_WO).
/// Temuan inspeksi (petugas Inspeksi Jaringan / Gardu dan admin) diteruskan ke tim ROW / HARTEK / YANDAL yang aktif.
/// Selama WO masih Terkirim, admin boleh memindah ke tim lain atau menarik kembali. Sesudah tim klik Mulai kerjakan,
/// WO terkunci (server menolak WO_SUDAH_DIMULAI). WO Selesai menampilkan tindak lanjut + rincian pekerjaan tim.
/// v1.0.15: foto temuan / tiang dimuat dari server (getFotoWoAdmin), filter penyulang / tanggal / tim inspeksi.
/// v1.0.16 (Master Guswan 22 Okt 2026): daftar = kartu ringkas temuan (ketuk = detail lengkap WO + foto pekerjaan tim);
/// teruskan / pindah / tarik diproses di latar (PenerusanWo), WO langsung hilang dari daftar. Daftar awal = Baru.
/// v1.0.18 (permintaan Master Guswan 22 Okt 2026): pindah + tarik WO terkirim pindah ke menu Pindah Tim TO ([pindah] = true:
/// daftar WO Terkirim saja, endpoint getWoPindah / pindahWo / tarikWo). Di Penerusan WO tab Terkirim hanya untuk dilihat.
class WoAdminScreen extends StatefulWidget {
  const WoAdminScreen({super.key, required this.deps, required this.sesi, this.pindah = false});
  final Deps deps;
  final Sesi sesi;
  final bool pindah;

  static const menu = 'OPS_PENERUSAN_WO';
  static const menuPindah = 'OPS_PINDAH_TIM_TO';

  @override
  State<WoAdminScreen> createState() => _WoAdminScreenState();
}

class _WoAdminScreenState extends State<WoAdminScreen> {
  static const _filter = [
    ('BARU', 'Baru'),
    ('AKTIF', 'Aktif'),
    ('TERKIRIM', 'Terkirim'),
    ('DIKERJAKAN', 'Dikerjakan'),
    ('SELESAI', 'Selesai'),
    ('SEMUA', 'Semua'),
  ];

  late String _status = widget.pindah ? 'TERKIRIM' : 'BARU'; // v1.0.16: daftar kerja admin = temuan yang belum diteruskan
  String _kata = '';
  // v1.0.15: filter. Tanggal = parameter server (dari / sampai), penyulang + tim inspeksi disaring di HP.
  String? _penyulang, _timInspeksi;
  DateTimeRange? _rentang;
  Map<String, dynamic>? _data;
  String? _galat;
  bool _muat = false;
  int? _waktuSimpan; // v1.0.47: _data dari simpanan HP (ms waktu simpan); null = segar dari server

  Sesi get _sesi => widget.sesi;
  PenerusanWo get _antre => PenerusanWo.i;
  bool get _pindah => widget.pindah;
  bool get _boleh => _sesi.bisaUbah(_pindah ? WoAdminScreen.menuPindah : WoAdminScreen.menu);

  /// v1.0.18: Penerusan WO = teruskan temuan Baru saja; Pindah Tim TO = pindah / tarik WO Terkirim saja.
  bool _bolehAksi(String s) => _pindah ? s.trim() == StatusWo.terkirim : StatusWo.bolehPindah(s) && s.trim() != StatusWo.terkirim;
  List<Map<String, dynamic>> get _tim => daftarWo(_data?['tim']);
  Map<String, dynamic> get _ringkas => petaWo(_data?['ringkas']);

  @override
  void initState() {
    super.initState();
    _antre.addListener(_dengar);
    // v1.0.47: kiriman yang belum terkirim sebelum app ditutup dilanjutkan (akun yang sama)
    unawaited(_antre.pulihkan(_sesi.userId, (aksi, data) => _api(aksi, data), selesai: (ok) {
      if (ok && mounted) unawaited(_segarkan(diam: true));
    }));
    unawaited(_segarkan());
  }

  @override
  void dispose() {
    _antre.removeListener(_dengar);
    super.dispose();
  }

  void _dengar() {
    if (mounted) setState(() {});
  }

  Future<Map<String, dynamic>> _api(String aksi, Map<String, dynamic> data) =>
      widget.deps.api.call(aksi, token: _sesi.token, data: data);

  Future<Map<String, dynamic>> _muatFoto(Map<String, dynamic> data, {Duration? timeout}) =>
      widget.deps.api.call(_pindah ? 'getFotoWoPindah' : 'getFotoWoAdmin', token: _sesi.token, data: data, timeout: timeout ?? const Duration(seconds: 60));

  void _pesan(String p) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(p), duration: const Duration(seconds: 2)));

  /// v1.0.58: kunci simpanan HP = akun + layar + rentang tanggal (status, penyulang, tim inspeksi disaring di HP).
  String get _kunciSimpan {
    final r = _rentang;
    return [_sesi.userId, _pindah ? 'pindah' : 'admin', if (r != null) tanggalIsoWo(r.start), if (r != null) tanggalIsoWo(r.end)].join('|');
  }

  String get _pesanOffline {
    final w = _waktuSimpan;
    return w == null || w <= 0 ? 'Offline: menampilkan data tersimpan.' : 'Offline: menampilkan data tersimpan ${waktuSimpanWo(DateTime.fromMillisecondsSinceEpoch(w), DateTime.now())}.';
  }

  /// [diam] = muat ulang tanpa menampilkan galat (sesudah penerusan di latar berhasil).
  /// v1.0.58: daftar lengkap tersimpan di HP; tampil dulu, lalu unduhan penuh (pembukaan pertama di peluncuran app ini,
  /// atau [penuh] = tarik / tombol muat ulang) atau hanya selisih (sinkronDaftarWo). Gagal = tetap data tersimpan.
  Future<void> _segarkan({bool diam = false, bool penuh = false}) async {
    if (_muat) return;
    setState(() {
      _muat = true;
      if (!diam) _galat = null;
    });
    final kunci = _kunciSimpan;
    try {
      final r = _rentang;
      final h = await sinkronDaftarWo(
        kunci: kunci,
        aksi: _pindah ? 'getWoPindah' : 'getWoAdmin',
        param: {if (r != null) 'dari': tanggalIsoWo(r.start), if (r != null) 'sampai': tanggalIsoWo(r.end)},
        api: _api,
        paksaPenuh: penuh,
        tampilLokal: (d, waktu) {
          if (mounted && _data == null && kunci == _kunciSimpan) {
            setState(() {
              _data = d;
              _waktuSimpan = waktu;
            });
          }
        },
      );
      if (mounted && kunci == _kunciSimpan) {
        setState(() {
          _data = h.data;
          _waktuSimpan = h.gagal ? h.waktuLokal : null;
          if (h.gagal && !diam) _galat = _pesanOffline;
        });
      }
      _antre.bersihkanSelesai();
      // foto temuan kartu disimpan di HP selagi ada sinyal (tampil saat offline)
      unawaited(FotoServerWo.praMuat(_muatFoto, [
        for (final t in saringStatusWo(daftarWo(h.data['temuan']), _pindah ? 'TERKIRIM' : _status))
          if (teksWo(petaWo(t['foto'])['TEMUAN']).isNotEmpty) {'temuanId': teksWo(t['temuanId']), 'slot': 'TEMUAN'},
      ]));
    } on ApiException catch (e) {
      final sinyal = e.kode.startsWith('HTTP_');
      if (mounted && !diam) setState(() => _galat = sinyal ? (_data != null ? _pesanOffline : 'Butuh sinyal untuk memuat WO.') : pesanWo(e.kode));
    } catch (_) {
      if (mounted && !diam) setState(() => _galat = _data != null ? _pesanOffline : 'Butuh sinyal untuk memuat WO.');
    } finally {
      if (mounted) setState(() => _muat = false);
    }
  }

  /// Tarik layar / tombol muat ulang = unduhan penuh (menangkap temuan yang hilang di server).
  Future<void> _segarkanPaksa() async {
    _muat = false;
    await _segarkan(penuh: true);
  }

  /// Rentang tanggal berubah = kunci simpanan lain: tampil dari simpanan rentang itu + selisih (bukan unduhan penuh paksa).
  Future<void> _segarkanUlang() async {
    _muat = false;
    await _segarkan();
  }

  int _rev(Map<String, dynamic> t) => num.tryParse(teksWo(t['revision']))?.toInt() ?? 1;

  Future<(String, String)?> _pilihTim(Map<String, dynamic> t) => pilihTimWo(context, temuan: t, tim: _tim);

  /// v1.0.16: teruskan / pindah di latar. WO langsung hilang dari daftar. Hasil true = masuk antrean.
  Future<bool> _teruskan(Map<String, dynamic> t) async {
    if (!_boleh) return false;
    final p = await _pilihTim(t);
    if (p == null || !mounted) return false;
    final nama = teksWo(_tim.where((x) => teksWo(x['timId']) == p.$1).map((x) => x['nama']).firstOrNull);
    teruskanWoKeAntre(
      userId: _sesi.userId,
      api: _api,
      temuan: t,
      timId: p.$1,
      namaTim: nama,
      catatan: p.$2,
      pindah: _pindah,
      selesai: (ok) {
        if (ok && mounted) unawaited(_segarkan(diam: true));
      },
    );
    // v1.0.58: kirim di latar tanpa chip proses; hanya kartu berhasil (gagal tetap tampil sebagai kartu galat di atas daftar)
    unawaited(tampilPopupBerhasil(context, judul: 'Data berhasil disimpan', keterangan: keteranganKirimWo(teksWo(t['kodeTemuan']), nama, pindah: _pindah), tembus: true));
    return true;
  }

  Future<bool> _tarik(Map<String, dynamic> t) async {
    if (!_boleh || !_pindah) return false;
    final ya = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Tarik WO?'),
        content: Text('WO ${teksWo(t['kodeTemuan'])} ditarik dari ${teksWo(petaWo(t['wo'])['tim'])} dan kembali ke Belum diteruskan.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Tarik')),
        ],
      ),
    );
    if (ya != true || !mounted) return false;
    final id = teksWo(t['temuanId']), rev = _rev(t);
    _antre.tambah(ItemPenerusanWo(
      temuanId: id,
      kode: teksWo(t['kodeTemuan']),
      judul: 'Ditarik dari ${teksWo(petaWo(t['wo'])['tim'])}',
      aksi: 'tarikWo',
      data: {'temuanId': id, 'revision': rev},
      userId: _sesi.userId,
      kirim: () => _api('tarikWo', {'temuanId': id, 'revision': rev}),
      selesai: (ok) {
        if (ok && mounted) unawaited(_segarkan(diam: true));
      },
    ));
    unawaited(tampilPopupBerhasil(context,
        judul: 'Data berhasil disimpan', keterangan: keteranganKirimWo(teksWo(t['kodeTemuan']), teksWo(petaWo(t['wo'])['tim']), ditarik: true), tembus: true));
    return true;
  }

  // ---------- tampilan ----------

  (Color, Color, IconData) _gaya(String s) {
    switch (s) {
      case StatusWo.terkirim:
        return (HartekGaya.merek, AppColors.brand100, Icons.outbox_rounded);
      case StatusWo.dikerjakan:
        return (AppColors.accent700, AppColors.accent100, Icons.construction_rounded);
      case StatusWo.selesai:
        return (AppColors.success700, AppColors.success100, Icons.task_alt_rounded);
      default:
        return (AppColors.red700, AppColors.red100, Icons.report_gmailerrorred_rounded);
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

  /// v1.0.16: kartu ringkas temuan. Foto temuan kecil, jenis + lokasi, status / tim / sumber / tanggal, aksi cepat.
  Widget _kartu(Map<String, dynamic> t) {
    final s = statusWoDari(t);
    final wo = petaWo(t['wo']);
    final (warna, latar, ikon) = _gaya(s);
    final ganda = wo['ganda'] == true;
    final adaFoto = teksWo(petaWo(t['foto'])['TEMUAN']).isNotEmpty;
    final id = teksWo(t['temuanId']);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: KartuHartek(
        padding: EdgeInsets.zero,
        onTap: () => unawaited(_bukaDetail(t)),
        child: IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Container(width: 5, color: ganda ? AppColors.red600 : warna),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: SizedBox(
                        width: 64,
                        height: 64,
                        child: adaFoto
                            ? ColoredBox(
                                color: AppColors.neutral100,
                                child: GambarServerWo(key: ValueKey('adm-$id'), muat: _muatFoto, data: {'temuanId': id, 'slot': 'TEMUAN'}))
                            : ColoredBox(color: latar, child: Icon(ikon, color: warna, size: 28)),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(teksWo(t['jenisTemuan']).isEmpty ? 'Temuan' : teksWo(t['jenisTemuan']),
                            maxLines: 2, overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: HartekGaya.tinta)),
                        if (lokasiTemuanWo(t).isNotEmpty)
                          Text(lokasiTemuanWo(t),
                              maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, height: 1.35, color: HartekGaya.redup)),
                      ]),
                    ),
                    const Icon(Icons.chevron_right_rounded, color: HartekGaya.redup),
                  ]),
                  const SizedBox(height: 10),
                  Wrap(spacing: 6, runSpacing: 6, children: [
                    _pil(StatusWo.label(s), warna, latar),
                    if (ganda) _pil('WO ganda', AppColors.red700, AppColors.red100, ikon: Icons.how_to_reg_rounded),
                    if (teksWo(wo['tim']).isNotEmpty) _pil(teksWo(wo['tim']), HartekGaya.tinta, AppColors.neutral100, ikon: Icons.groups_rounded),
                    _pil(timInspeksiWo(t), HartekGaya.redup, AppColors.neutral100, ikon: Icons.travel_explore_rounded),
                    if (teksWo(t['tanggal']).isNotEmpty) _pil(teksWo(t['tanggal']), HartekGaya.redup, AppColors.neutral100, ikon: Icons.event_rounded),
                  ]),
                  if (s == StatusWo.selesai && teksWo(wo['tindakLanjut']).isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(teksWo(wo['tindakLanjut']),
                        maxLines: 2, overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.success700)),
                  ],
                  const SizedBox(height: 8),
                  Row(children: [
                    Expanded(child: Text(teksWo(t['kodeTemuan']), maxLines: 1, overflow: TextOverflow.ellipsis, style: HartekGaya.kode)),
                    if (_boleh && _bolehAksi(s) && !ganda)
                      FilledButton.tonalIcon(
                        onPressed: () => unawaited(_teruskan(t)),
                        icon: Icon(s == StatusWo.terkirim ? Icons.swap_horiz_rounded : Icons.alt_route_rounded, size: 18),
                        label: Text(s == StatusWo.terkirim ? 'Pindah' : 'Teruskan'),
                      ),
                  ]),
                ]),
              ),
            ),
          ]),
        ),
      ),
    );
  }

  // ---------- detail WO ----------

  Future<void> _bukaDetail(Map<String, dynamic> t) => Navigator.of(context).push<void>(MaterialPageRoute(
        builder: (ctx) => Scaffold(backgroundColor: HartekGaya.latar, body: SafeArea(child: _isiDetail(ctx, t))),
      ));

  /// v1.0.48: Kirim WA format v1. Foto temuan dilampirkan sebagai gambar (Drive privat: link tidak terbuka penerima).
  /// Offline = thumbnail yang tersimpan di HP; tanpa foto = teks saja (baris Foto Temuan berisi link / '-').
  Future<void> _kirimWa(Map<String, dynamic> t) async {
    final id = teksWo(t['temuanId']);
    String? path;
    if (teksWo(petaWo(t['foto'])['TEMUAN']).isNotEmpty) {
      _pesan('Menyiapkan foto temuan...');
      final data = {'temuanId': id, 'slot': 'TEMUAN'};
      try {
        path = await FotoServerWo.penuh(_muatFoto, data);
      } catch (_) {
        try {
          final b = await FotoServerWo.kecil(_muatFoto, data);
          final f = File(p.join((await getTemporaryDirectory()).path, 'wa_temuan_${id.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '_')}.jpg'));
          await f.writeAsBytes(b, flush: true);
          path = f.path;
        } catch (_) {/* tanpa foto */}
      }
    }
    final teks = teksWaTemuanWo(t, fotoTerlampir: path != null);
    if (path != null) {
      await Share.shareXFiles([XFile(path, mimeType: 'image/jpeg')], text: teks, subject: teksWo(t['kodeTemuan']));
    } else {
      await Share.share(teks, subject: teksWo(t['kodeTemuan']));
    }
  }

  Widget _baris(String label, String nilai) => Padding(
        padding: const EdgeInsets.only(top: 6),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 108, child: Text(label, style: const TextStyle(fontSize: 13, color: HartekGaya.redup))),
          Expanded(child: Text(nilai, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: HartekGaya.tinta))),
        ]),
      );

  Widget _isiDetail(BuildContext ctx, Map<String, dynamic> t) {
    final wo = petaWo(t['wo']);
    final s = teksWo(wo['status']);
    final (warna, latar, ikon) = _gaya(s);
    final pekerjaan = daftarWo(t['pekerjaanWo']);
    final ganda = wo['ganda'] == true;
    final id = teksWo(t['temuanId']);
    Future<void> aksi(Future<bool> Function(Map<String, dynamic>) f) async {
      if (await f(t) && ctx.mounted) await Navigator.maybePop(ctx);
    }

    return Column(children: [
      Expanded(
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 10, 16, 24), children: [
          HeaderInsJar(
            kicker: 'Detail WO Temuan',
            judul: teksWo(t['jenisTemuan']).isEmpty ? 'Temuan' : teksWo(t['jenisTemuan']),
            sub: teksWo(t['kodeTemuan']),
            ikon: ikon,
            aksi: [tombolHeaderInsJar(Icons.arrow_back_rounded, 'Kembali', () => Navigator.maybePop(ctx))],
          ),
          KartuHartek(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Wrap(spacing: 6, runSpacing: 6, children: [
                _pil(StatusWo.label(s), warna, latar),
                if (ganda) _pil('WO ganda: verifikasi di menu Verifikasi WO Ganda', AppColors.red700, AppColors.red100, ikon: Icons.how_to_reg_rounded),
              ]),
              const SizedBox(height: 6),
              _baris('Lokasi', lokasiTemuanWo(t).isEmpty ? '-' : lokasiTemuanWo(t)),
              if (teksWo(t['koordinat']).isNotEmpty) _baris('Koordinat', teksWo(t['koordinat'])),
              _baris('Objek', teksWo(t['objekInspeksi']).isEmpty ? '-' : teksWo(t['objekInspeksi'])),
              if (teksWo(t['tierInspeksi']).isNotEmpty) _baris('Tier', teksWo(t['tierInspeksi'])),
              _baris('Sumber', timInspeksiWo(t)),
              if (teksWo(t['tanggal']).isNotEmpty) _baris('Tanggal temuan', teksWo(t['tanggal'])),
              if (teksWo(t['deskripsi']).isNotEmpty) _baris('Deskripsi', teksWo(t['deskripsi'])),
              FotoTemuanWo(t: t, muat: _muatFoto),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFF1FA855), side: const BorderSide(color: Color(0xFF1FA855)), minimumSize: const Size.fromHeight(44)),
                onPressed: () => unawaited(_kirimWa(t)),
                icon: const Icon(Icons.forum_rounded),
                label: const Text('Kirim WA'),
              ),
            ]),
          ),
          const SizedBox(height: 12),
          KartuHartek(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              const Text('Tindak lanjut', style: HartekGaya.judulSeksi),
              if (teksWo(wo['tim']).isNotEmpty) _baris('Tim', '${teksWo(wo['tim'])}${teksWo(wo['jenisTim']).isEmpty ? '' : ' (${teksWo(wo['jenisTim'])})'}'),
              if (teksWo(wo['catatanAdmin']).isNotEmpty) _baris('Catatan', teksWo(wo['catatanAdmin'])),
              if (teksWo(wo['waktuDiteruskan']).isNotEmpty) _baris('Diteruskan', '${waktuWo(teksWo(wo['waktuDiteruskan']))} · ${teksWo(wo['diteruskanOleh'])}'),
              if (teksWo(wo['waktuMulai']).isNotEmpty) _baris('Dimulai', '${waktuWo(teksWo(wo['waktuMulai']))} · ${teksWo(wo['dimulaiOleh'])}'),
              if (teksWo(wo['waktuSelesai']).isNotEmpty) _baris('Selesai', '${waktuWo(teksWo(wo['waktuSelesai']))} · ${teksWo(wo['diselesaikanOleh'])}'),
              if (teksWo(wo['tindakLanjut']).isNotEmpty)
                Container(
                  margin: const EdgeInsets.only(top: 10),
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: AppColors.success100, borderRadius: BorderRadius.circular(12)),
                  child: Text(teksWo(wo['tindakLanjut']), style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: AppColors.success700)),
                ),
              if (s.isEmpty) const Padding(padding: EdgeInsets.only(top: 6), child: Text('Belum diteruskan ke tim.', style: HartekGaya.sekunder)),
              if (s == StatusWo.terkirim && !_pindah)
                const Padding(
                  padding: EdgeInsets.only(top: 8),
                  child: Text('Untuk memindah atau menarik WO ini, buka menu Pindah Tim TO.',
                      style: TextStyle(fontSize: 12.5, color: HartekGaya.redup, fontWeight: FontWeight.w600)),
                ),
              if (s == StatusWo.dikerjakan)
                const Padding(
                  padding: EdgeInsets.only(top: 8),
                  child: Text('Sedang dikerjakan tim, WO tidak bisa dipindah.',
                      style: TextStyle(fontSize: 12.5, color: AppColors.accent700, fontWeight: FontWeight.w600)),
                ),
            ]),
          ),
          if (pekerjaan.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text('Pekerjaan tim (${pekerjaan.length})', style: HartekGaya.judulSeksi),
            for (final p in pekerjaan)
              Container(
                margin: const EdgeInsets.only(top: 10),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: HartekGaya.garis)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Text(ringkasPekerjaanWo(p), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: HartekGaya.tinta)),
                  Text([teksWo(p['kodeTl']), if (teksWo(p['kodeRealisasiModul']).isNotEmpty) '→ ${teksWo(p['kodeRealisasiModul'])}'].join('  '),
                      style: HartekGaya.kode),
                  FotoRincian(
                    node: p,
                    slot: slotFotoWo,
                    label: labelFotoWo,
                    onTap: (sl) {
                      if (teksWo(petaWo(p['foto'])[sl]).isEmpty) return;
                      unawaited(FotoServerWo.lihat(ctx, _muatFoto, {'temuanId': id, 'tlId': teksWo(p['tlId']), 'slot': sl}, labelFotoWo[sl] ?? sl));
                    },
                    gambarServer: (sl) =>
                        GambarServerWo(key: ValueKey('adm-${teksWo(p['tlId'])}-$sl'), muat: _muatFoto, data: {'temuanId': id, 'tlId': teksWo(p['tlId']), 'slot': sl}),
                  ),
                ]),
              ),
          ],
        ]),
      ),
      if (_boleh && _bolehAksi(s) && !ganda)
        Container(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
          decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: HartekGaya.garis))),
          child: SafeArea(
            top: false,
            child: Row(children: [
              if (s == StatusWo.terkirim) ...[
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => unawaited(aksi(_tarik)),
                    style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                    icon: const Icon(Icons.undo_rounded, size: 18),
                    label: const Text('Tarik'),
                  ),
                ),
                const SizedBox(width: 10),
              ],
              Expanded(
                flex: 2,
                child: FilledButton.icon(
                  onPressed: () => unawaited(aksi(_teruskan)),
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                  icon: Icon(s == StatusWo.terkirim ? Icons.swap_horiz_rounded : Icons.alt_route_rounded, size: 18),
                  label: Text(s == StatusWo.terkirim ? 'Pindah tim' : 'Teruskan ke tim'),
                ),
              ),
            ]),
          ),
        ),
    ]);
  }

  // ---------- antrean latar ----------

  Widget _barisAntre() {
    final gagal = _antre.daftarGagal;
    // v1.0.58: item yang sedang diproses / menunggu sinyal tidak lagi ditandai (kartu berhasil sudah muncul saat dikirim); hanya gagal
    if (gagal.isEmpty) return const SizedBox.shrink();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      for (final x in gagal)
        Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.fromLTRB(12, 10, 6, 6),
          decoration: BoxDecoration(color: AppColors.red100, borderRadius: BorderRadius.circular(14)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('${x.kode}: ${x.judul} gagal', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.red700)),
            if ((x.galat ?? '').isNotEmpty) Text(x.galat!, style: const TextStyle(fontSize: 12.5, color: AppColors.red700)),
            Row(mainAxisAlignment: MainAxisAlignment.end, children: [
              TextButton(onPressed: () => _antre.batalkan(x), child: const Text('Batalkan')),
              FilledButton(onPressed: () => _antre.cobaLagi(x), child: const Text('Coba lagi')),
            ]),
          ]),
        ),
    ]);
  }

  Widget _chip(String kode, String label) {
    final n = switch (kode) {
      'BARU' => _ringkas['baru'],
      'TERKIRIM' => _ringkas['terkirim'],
      'DIKERJAKAN' => _ringkas['dikerjakan'],
      'SELESAI' => _ringkas['selesai'],
      _ => null,
    };
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        label: Text(n == null ? label : '$label ($n)'),
        selected: _status == kode,
        onSelected: _muat
            ? null
            : (_) {
                setState(() => _status = kode); // v1.0.58: status disaring di HP, tanpa memanggil server
              },
      ),
    );
  }

  // ---------- filter (v1.0.15) ----------

  bool get _adaFilter => _penyulang != null || _timInspeksi != null || _rentang != null;

  String _tgl(DateTime d) => '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';

  String? get _labelRentang {
    final r = _rentang;
    if (r == null) return null;
    return DateUtils.isSameDay(r.start, r.end) ? _tgl(r.start) : '${_tgl(r.start)} - ${_tgl(r.end)}';
  }

  Future<void> _pilihFilter(String judul, List<String> pilihan, String? terpilih, void Function(String?) atur) async {
    if (pilihan.isEmpty) {
      _pesan('Belum ada pilihan di daftar ini.');
      return;
    }
    final v = await bukaPilihan(
      context,
      judul: judul,
      pilihan: [for (final x in pilihan) PilihanItem(x, x)],
      terpilih: terpilih,
      selaluCari: pilihan.length > 8,
    );
    if (v != null && mounted) setState(() => atur(v));
  }

  Future<void> _pilihRentang() async {
    final now = DateTime.now();
    final r = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2024),
      lastDate: DateTime(now.year, now.month, now.day),
      initialDateRange: _rentang,
      helpText: 'Tanggal temuan (ketuk dua kali untuk satu hari)',
      saveText: 'Terapkan',
    );
    if (r == null || !mounted) return;
    setState(() {
      _rentang = r;
      _data = null;
    });
    unawaited(_segarkanUlang());
  }

  void _hapusRentang() {
    setState(() {
      _rentang = null;
      _data = null;
    });
    unawaited(_segarkanUlang());
  }

  void _resetFilter() {
    final ulang = _rentang != null;
    setState(() {
      _penyulang = null;
      _timInspeksi = null;
      _rentang = null;
      if (ulang) _data = null;
    });
    if (ulang) unawaited(_segarkanUlang());
  }

  Widget _chipFilter(IconData ikon, String judul, String? nilai, VoidCallback? onTap, VoidCallback onHapus) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: InputChip(
          avatar: Icon(ikon, size: 18, color: nilai == null ? HartekGaya.redup : HartekGaya.merek),
          label: Text(nilai ?? judul, overflow: TextOverflow.ellipsis),
          selected: nilai != null,
          showCheckmark: false,
          onPressed: onTap,
          onDeleted: nilai == null ? null : onHapus,
          deleteIcon: const Icon(Icons.close_rounded, size: 16),
          tooltip: judul,
        ),
      );

  Widget _barisFilter(List<Map<String, dynamic>> semua) {
    final bisa = !_muat;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(children: [
        _chipFilter(
          Icons.cable_rounded,
          'Penyulang',
          _penyulang,
          bisa ? () => unawaited(_pilihFilter('Pilih penyulang', pilihanFilterWo(semua, (t) => teksWo(t['penyulang'])), _penyulang, (v) => _penyulang = v)) : null,
          () => setState(() => _penyulang = null),
        ),
        _chipFilter(Icons.event_rounded, 'Tanggal', _labelRentang, bisa ? () => unawaited(_pilihRentang()) : null, _hapusRentang),
        _chipFilter(
          Icons.groups_rounded,
          'Tim inspeksi',
          _timInspeksi,
          bisa ? () => unawaited(_pilihFilter('Pilih tim inspeksi', pilihanFilterWo(semua, timInspeksiWo), _timInspeksi, (v) => _timInspeksi = v)) : null,
          () => setState(() => _timInspeksi = null),
        ),
        if (_adaFilter) TextButton.icon(onPressed: bisa ? _resetFilter : null, icon: const Icon(Icons.filter_alt_off_rounded, size: 18), label: const Text('Reset')),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final semua = saringStatusWo(daftarWo(_data?['temuan']), _pindah ? StatusWo.terkirim : _status);
    final sembunyi = _antre.disembunyikan;
    final tampil = semua
        .where((t) =>
            !sembunyi.contains(teksWo(t['temuanId'])) && cocokCariWo(t, _kata) && cocokFilterWo(t, penyulang: _penyulang, timInspeksi: _timInspeksi))
        .toList();
    final saring = _kata.isNotEmpty || _adaFilter;
    final r = _ringkas;
    final ganda = num.tryParse(teksWo(r['ganda'])) ?? 0;
    return Scaffold(
      backgroundColor: HartekGaya.latar,
      body: SafeArea(
        child: RefreshSisi(
          onRefresh: _segarkanPaksa,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 40),
            children: [
              HeaderInsJar(
                kicker: _pindah ? 'Pindah Tim TO' : 'Penerusan Tim Temuan Inspeksi',
                judul: _pindah ? '${tampil.length} WO terkirim' : '${tampil.length} temuan',
                sub: _pindah
                    ? 'Pindahkan / tarik WO yang belum dimulai tim'
                    : '${r['baru'] ?? 0} baru · ${r['terkirim'] ?? 0} terkirim · ${r['dikerjakan'] ?? 0} dikerjakan${ganda > 0 ? ' · $ganda ganda' : ''}',
                ikon: _pindah ? Icons.swap_horiz_rounded : Icons.alt_route_rounded,
                aksi: [
                  tombolSegarkanHeader(_segarkanPaksa, sibuk: _muat),
                  const SizedBox(width: 6),
                  tombolHeaderInsJar(Icons.arrow_back_rounded, 'Kembali', () => Navigator.maybePop(context)),
                ],
              ),
              _barisAntre(),
              if (!_pindah)
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(children: [for (final f in _filter) _chip(f.$1, f.$2)]),
                ),
              const SizedBox(height: 10),
              TextField(
                onChanged: (v) => setState(() => _kata = v),
                decoration: InputDecoration(
                  hintText: 'Cari kode, jenis, penyulang, gardu, tim...',
                  prefixIcon: const Icon(Icons.search_rounded),
                  filled: true,
                  fillColor: Colors.white,
                  isDense: true,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.neutral200)),
                  enabledBorder:
                      OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.neutral200)),
                ),
              ),
              const SizedBox(height: 10),
              _barisFilter(semua),
              const SizedBox(height: 12),
              if (_galat != null)
                Container(
                  margin: const EdgeInsets.only(bottom: 14),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(color: AppColors.red100, borderRadius: BorderRadius.circular(14)),
                  child: Row(children: [
                    const Icon(Icons.error_outline_rounded, color: AppColors.red700, size: 20),
                    const SizedBox(width: 10),
                    Expanded(child: Text(_galat!, style: const TextStyle(fontSize: 14, color: AppColors.red700))),
                    TextButton(onPressed: _segarkanPaksa, child: const Text('Coba lagi')),
                  ]),
                ),
              if (_data == null && _galat == null)
                const Padding(padding: EdgeInsets.only(top: 40), child: Center(child: SisiLoader()))
              else if (_data != null && tampil.isEmpty)
                KosongHartek(
                  ikon: Icons.inbox_outlined,
                  judul: saring ? 'Tidak ditemukan' : 'Tidak ada temuan',
                  petunjuk: saring
                      ? 'Coba kata lain atau ubah filter.'
                      : (_pindah ? 'Tidak ada WO terkirim yang menunggu dimulai tim.' : 'Belum ada temuan dengan status ini.'),
                )
              else
                for (final t in tampil) _kartu(t),
            ],
          ),
        ),
      ),
    );
  }
}
