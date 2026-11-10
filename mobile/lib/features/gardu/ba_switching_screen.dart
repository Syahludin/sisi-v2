import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/gps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../core/wib.dart';
import '../../theme/app_colors.dart';
import '../../widgets/foto_slot.dart';
import '../../widgets/kolom_pilih.dart';
import '../../widgets/sisi_widgets.dart';
import '../row/foto_repository.dart';
import '../row/row_model.dart';
import '../row/watermark.dart';
import 'ba_antrean.dart';
import 'ba_bantu.dart';
import 'ba_repository.dart';
import '../../widgets/sisi_loader.dart';

/// v1.0.49: jenis BA switching (sama v1 + BA_JENIS_PEKERJAAN_.SWITCHING server).
const jenisBaSwitching = <String>[
  'Pengoperasian Switching',
  'Penggantian Switching',
  'Relokasi Switching',
  'Pemeriksaan Switching',
  'Kerusakan Switching',
];

/// Jenis peralatan switching (v1 swJenisSwitching).
const jenisAlatSwitching = <String>['LBS Motorized', 'Recloser', 'Fuse Cut Out (FCO)', 'Disconnecting Switch (DS)'];

/// Penggantian / Relokasi = ada data switching SESUDAH.
bool switchingSesudah(String jenis) => jenis == 'Penggantian Switching' || jenis == 'Relokasi Switching';

/// Pemeriksaan / Kerusakan = ada Keterangan Kerusakan / Pemeriksaan.
bool switchingKerusakan(String jenis) => jenis == 'Pemeriksaan Switching' || jenis == 'Kerusakan Switching';

/// Slot foto switching (sama slotFotoSwitching_ server): (slot, label, wajib). Konstruksi + SLD wajib, nameplate boleh kosong.
List<(String, String, bool)> slotFotoSwitching(String jenis) {
  final g = switchingSesudah(jenis);
  return [
    ('NAMEPLATE', g ? 'Nameplate Switching Sebelum' : 'Nameplate Switching', false),
    ('KONSTRUKSI', g ? 'Konstruksi Switching Sebelum' : 'Konstruksi Switching', true),
    if (g) ('NAMEPLATE_SESUDAH', 'Nameplate Switching Sesudah', false),
    if (g) ('KONSTRUKSI_SESUDAH', 'Konstruksi Switching Sesudah', true),
    ('SLD_SEBELUM', 'SLD Sebelum', true),
    ('SLD_SESUDAH', 'SLD Sesudah', true),
  ];
}

/// Foto wajib yang belum ada (label), urut form.
List<String> fotoKurangSwitching(String jenis, Set<String> terisi) =>
    [for (final s in slotFotoSwitching(jenis)) if (s.$3 && !terisi.contains(s.$1)) s.$2];

class _FotoGanti {
  _FotoGanti(this.path, this.sumber, {this.asli, this.wm, this.server = false});
  String path;
  final String sumber;
  final bool server;
  final String? asli;
  DataWatermark? wm;
  String? shaTerkirim;
}

/// v1.0.49 (permintaan Master Guswan 30 Okt 2026): Form BA Switching, isian sama v1 (SIE-BeritaAcara.html swCards). Satu layar untuk
/// lima jenis ([jenis]): Data Switching (nama diketik, penyulang / section dari master jaringan), Data Switching Sesudah
/// (Penggantian / Relokasi), Keterangan (+ kerusakan untuk Pemeriksaan / Kerusakan), Lampiran, Pemeriksa. Tanpa OwnerId /
/// External Reference, Master Gardu tidak berubah. Simpan lewat antrean latar (AntreanBa) seperti BA trafo.
class BaSwitchingScreen extends StatefulWidget {
  const BaSwitchingScreen({super.key, required this.deps, required this.sesi, required this.jenis, this.ubahBaId});
  final Deps deps;
  final Sesi sesi;
  final String jenis;
  final String? ubahBaId;

  @override
  State<BaSwitchingScreen> createState() => _BaSwitchingScreenState();
}

class _BaSwitchingScreenState extends State<BaSwitchingScreen> {
  static const _tanpa = '__TANPA__';
  static const _lihat = '__LIHAT__';

  final _form = GlobalKey<FormState>();
  late final String _baId = widget.ubahBaId ?? const Uuid().v4();
  bool get _edit => widget.ubahBaId != null;
  String get _jenis => widget.jenis;
  bool get _sesudah => switchingSesudah(_jenis);
  Map<String, dynamic>? _detail;
  String? _galatDetail;
  late final BaRepository _repo = BaRepository(widget.deps.api);

  final _nama = TextEditingController();
  final _merk = TextEditingController();
  final _tipe = TextEditingController();
  final _seri = TextEditingController();
  final _koordinat = TextEditingController();
  final _namaSes = TextEditingController();
  final _merkSes = TextEditingController();
  final _tipeSes = TextEditingController();
  final _seriSes = TextEditingController();
  final _koordinatSes = TextEditingController();
  final _asal = TextEditingController();
  final _catatan = TextEditingController();
  final _kerusakan = TextEditingController();

  String _tglBa = Wib.tanggal(DateTime.now());
  String _tglKerja = Wib.tanggal(DateTime.now());
  String? _jenisAlat, _jenisAlatSes;
  List<String> _penyulang = const [];
  String? _pny, _pnySes, _sectionId, _sectionIdSes;
  List<({String id, String nama})> _section = const [], _sectionSes = const [];
  String? _wmSlot;
  final _scroll = ScrollController();
  final _kunci = {for (final k in ['identitas', 'switching', 'sesudah', 'keterangan', 'foto', 'pemeriksa']) k: GlobalKey()};
  final Map<String, _FotoGanti> _foto = {};
  List<Map<String, dynamic>> _pejabat = const [];
  String? _petugas1;
  String? _petugas2;
  bool _kirim = false;
  bool _kotor = false;

  @override
  void initState() {
    super.initState();
    unawaited(_muatMaster().then((_) => _edit ? _muatDetail() : null));
  }

  @override
  void dispose() {
    for (final c in [_nama, _merk, _tipe, _seri, _koordinat, _namaSes, _merkSes, _tipeSes, _seriSes, _koordinatSes, _asal, _catatan, _kerusakan]) {
      c.dispose();
    }
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _muatMaster() async {
    final p = await widget.deps.master.penyulang();
    final pj = await widget.deps.gardu.pejabatBa();
    if (!mounted) return;
    setState(() {
      _penyulang = p;
      _pejabat = pj;
    });
  }

  Future<void> _muatDetail() async {
    setState(() => _galatDetail = null);
    try {
      final d = await _repo.detail(widget.sesi, _baId);
      final dir = await getTemporaryDirectory();
      final foto = <String, _FotoGanti>{};
      for (final sl in (d['foto'] as List<dynamic>? ?? const <dynamic>[]).map((e) => '$e')) {
        final b = await _repo.foto(widget.sesi, _baId, sl);
        final f = File('${dir.path}/ba_edit_${_baId.substring(0, 8)}_${sl}_${DateTime.now().millisecondsSinceEpoch}.jpg');
        await f.writeAsBytes(b, flush: true);
        foto[sl] = _FotoGanti(f.path, 'SERVER', server: true);
      }
      String t(String k) => '${d[k] ?? ''}';
      final sec = t('penyulang').isEmpty ? const <({String id, String nama})>[] : await widget.deps.master.section(t('penyulang'));
      final secSes = t('penyulangSesudah').isEmpty ? const <({String id, String nama})>[] : await widget.deps.master.section(t('penyulangSesudah'));
      if (!mounted) return;
      String? n(String k) => t(k).isEmpty ? null : t(k);
      setState(() {
        _detail = d;
        _tglBa = t('tanggalBa').isEmpty ? _tglBa : t('tanggalBa');
        _tglKerja = t('tanggalPekerjaan').isEmpty ? _tglKerja : t('tanggalPekerjaan');
        _jenisAlat = jenisAlatSwitching.contains(t('jenisSwitching')) ? t('jenisSwitching') : null;
        _nama.text = t('namaSwitching');
        _pny = n('penyulang');
        _section = sec;
        _sectionId = n('sectionId');
        _merk.text = t('merk');
        _tipe.text = t('tipe');
        _seri.text = t('seri');
        _koordinat.text = t('koordinat');
        _jenisAlatSes = jenisAlatSwitching.contains(t('jenisSwitchingSesudah')) ? t('jenisSwitchingSesudah') : null;
        _namaSes.text = t('namaSwitchingSesudah');
        _pnySes = n('penyulangSesudah');
        _sectionSes = secSes;
        _sectionIdSes = n('sectionIdSesudah');
        _merkSes.text = t('merkSesudah');
        _tipeSes.text = t('tipeSesudah');
        _seriSes.text = t('seriSesudah');
        _koordinatSes.text = t('koordinatSesudah');
        _asal.text = t('asalSwitching');
        _catatan.text = t('catatan');
        _kerusakan.text = t('kerusakan');
        _petugas1 = n('petugas1Id');
        _petugas2 = n('petugas2Id');
        _foto
          ..clear()
          ..addAll(foto);
      });
    } catch (e) {
      if (mounted) setState(() => _galatDetail = _pesanGagal(e));
    }
  }

  List<Map<String, dynamic>> get _pemeriksa => _pejabat.where((p) => p['peran'] == 'PEMERIKSA').toList();
  List<Map<String, dynamic>> get _mengetahui => _pejabat.where((p) => p['peran'] == 'MENGETAHUI').toList();

  void _ubah(VoidCallback f) => setState(() {
        f();
        _kotor = true;
      });

  String _pesanGagal(Object e) => e is ApiException ? KodeError.pesan(e.kode) : 'Gagal terhubung. Cek sinyal lalu coba lagi.';

  Future<void> _pilihPenyulang(String p, {bool sesudah = false}) async {
    _ubah(() {
      if (sesudah) {
        _pnySes = p;
        _sectionIdSes = null;
        _sectionSes = const [];
      } else {
        _pny = p;
        _sectionId = null;
        _section = const [];
      }
    });
    final s = await widget.deps.master.section(p);
    if (!mounted) return;
    setState(() {
      if (sesudah && _pnySes == p) _sectionSes = s;
      if (!sesudah && _pny == p) _section = s;
    });
  }

  Future<void> _pilihTanggal(bool ba) async {
    final hariIni = DateTime.parse(Wib.tanggal(DateTime.now()));
    final awal = DateTime.parse(ba ? _tglBa : _tglKerja);
    final t = await showDatePicker(
      context: context,
      initialDate: awal.isAfter(hariIni) ? hariIni : awal,
      firstDate: DateTime(2020, 1, 1),
      lastDate: ba ? hariIni : DateTime.parse(_tglBa),
      helpText: ba ? 'Tanggal BA' : 'Tanggal Pekerjaan',
    );
    if (t == null || !mounted) return;
    final s = DateFormat('yyyy-MM-dd').format(t);
    _ubah(() {
      if (ba) {
        _tglBa = s;
        if (_tglKerja.compareTo(s) > 0) _tglKerja = s;
      } else {
        _tglKerja = s;
      }
    });
  }

  String get _namaTampil => _nama.text.trim().isEmpty ? '-' : _nama.text.trim();

  Future<void> _ambilFoto(String slot, String label) async {
    final sumber = await showModalBottomSheet<Object>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Text(label, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.navy900)),
          ),
          if (_foto[slot] != null)
            ListTile(
              leading: const Icon(Icons.zoom_in_rounded, color: AppColors.brand700),
              title: const Text('Lihat foto'),
              subtitle: const Text('Perbesar dan cek watermark'),
              onTap: () => Navigator.pop(c, _lihat),
            ),
          ListTile(
            leading: const Icon(Icons.photo_camera_outlined),
            title: const Text('Kamera'),
            subtitle: const Text('Watermark otomatis: Nama Switching, bagian foto, tanggal, koordinat'),
            onTap: () => Navigator.pop(c, ImageSource.camera),
          ),
          ListTile(
            leading: const Icon(Icons.photo_library_outlined),
            title: const Text('Galeri'),
            subtitle: const Text('Tanpa watermark (mis. gambar SLD)'),
            onTap: () => Navigator.pop(c, ImageSource.gallery),
          ),
          if (_foto[slot] != null && !_foto[slot]!.server)
            ListTile(
              leading: const Icon(Icons.delete_outline_rounded, color: AppColors.red600),
              title: const Text('Hapus foto', style: TextStyle(color: AppColors.red600)),
              onTap: () {
                Navigator.pop(c);
                _ubah(() => _foto.remove(slot));
              },
            ),
          const SizedBox(height: 8),
        ]),
      ),
    );
    if (sumber == null || !mounted) return;
    if (sumber == _lihat) {
      final f = _foto[slot];
      if (f != null) await lihatFoto(context, path: f.path, slot: label, keterangan: '$_namaTampil · $label');
      return;
    }
    if (sumber == ImageSource.camera && _nama.text.trim().isEmpty) {
      tampilPesan(context, 'Isi Nama Switching dulu supaya namanya masuk watermark foto.');
      return;
    }
    if (sumber is! ImageSource) return;
    final x = await FotoRepository.ambil(sumber);
    if (x == null || !mounted) return;
    if (sumber == ImageSource.gallery) {
      _ubah(() => _foto[slot] = _FotoGanti(x.path, 'GALERI'));
      return;
    }
    final waktu = DateTime.now();
    setState(() => _wmSlot = slot);
    var koordinat = Koordinat.cek(_koordinat.text, wajib: true) == null ? _koordinat.text.trim() : '';
    double? akurasi;
    if (koordinat.isEmpty) {
      final p = await Gps.sampelPertama(batas: const Duration(seconds: 8));
      if (p != null && !p.isMocked) {
        koordinat = Koordinat.format(p.latitude, p.longitude);
        akurasi = p.accuracy;
      }
    }
    final wm =
        watermarkBa(ulp: widget.sesi.ulp, jenisBa: _jenis, noGardu: _namaTampil, bagian: label, waktu: waktu, koordinat: koordinat, akurasiM: akurasi);
    try {
      final jadi = await pasangWatermarkBa(x.path, wm, '${_baId.substring(0, 8)}_$slot');
      if (!mounted) return;
      _ubah(() => _foto[slot] = _FotoGanti(jadi, 'KAMERA', asli: x.path, wm: wm));
    } catch (_) {
      if (mounted) tampilPesan(context, 'Watermark gagal dipasang. Coba ambil foto lagi.');
    } finally {
      if (mounted) setState(() => _wmSlot = null);
    }
  }

  String? _wajib(String? v) => (v ?? '').trim().isEmpty ? 'Wajib diisi' : null;
  String? _koordinatBoleh(String? v) => (v ?? '').trim().isEmpty ? null : Koordinat.cek(v ?? '', wajib: true);

  ({String kartu, String pesan})? _isianSalah() {
    final aturan = <(String, String, String? Function())>[
      ('switching', 'Jenis Switching', () => _jenisAlat == null ? 'Wajib dipilih' : null),
      ('switching', 'Nama Switching', () => _wajib(_nama.text)),
      ('switching', 'Section', () => _sectionId == null ? 'Pilih penyulang dan section' : null),
      ('switching', 'Koordinat', () => _koordinatBoleh(_koordinat.text)),
      if (_sesudah) ...[
        ('sesudah', 'Jenis Switching Sesudah', () => _jenisAlatSes == null ? 'Wajib dipilih' : null),
        ('sesudah', 'Nama Switching Sesudah', () => _wajib(_namaSes.text)),
        ('sesudah', 'Section Sesudah', () => _sectionIdSes == null ? 'Pilih penyulang dan section sesudah' : null),
        ('sesudah', 'Koordinat Sesudah', () => _koordinatBoleh(_koordinatSes.text)),
      ],
      ('foto', 'Foto', () {
        final k = fotoKurangSwitching(_jenis, _foto.keys.toSet());
        return k.isEmpty ? null : 'Belum lengkap: ${k.join(', ')}';
      }),
      ('pemeriksa', 'Petugas 1', () => _petugas1 == null ? 'Wajib dipilih' : null),
    ];
    for (final a in aturan) {
      final e = a.$3();
      if (e != null) return (kartu: a.$1, pesan: '${a.$2}: $e');
    }
    return null;
  }

  void _gulirKe(String kartu) {
    final c = _kunci[kartu]?.currentContext;
    if (c != null) unawaited(Scrollable.ensureVisible(c, duration: const Duration(milliseconds: 400), alignment: .05));
  }

  Map<String, dynamic> _isi() {
    String t(TextEditingController c) => c.text.trim();
    return {
      'baId': _baId,
      'jenis': _jenis,
      'tanggalBa': _tglBa,
      'tanggalPekerjaan': _tglKerja,
      'jenisSwitching': _jenisAlat,
      'namaSwitching': t(_nama),
      'sectionId': _sectionId,
      'merk': t(_merk),
      'tipe': t(_tipe),
      'seri': t(_seri),
      if (Koordinat.cek(_koordinat.text, wajib: true) == null) 'koordinat': t(_koordinat),
      'catatan': t(_catatan),
      if (switchingKerusakan(_jenis)) 'kerusakan': t(_kerusakan),
      if (_sesudah) ...{
        'jenisSwitchingSesudah': _jenisAlatSes,
        'namaSwitchingSesudah': t(_namaSes),
        'sectionIdSesudah': _sectionIdSes,
        'merkSesudah': t(_merkSes),
        'tipeSesudah': t(_tipeSes),
        'seriSesudah': t(_seriSes),
        if (Koordinat.cek(_koordinatSes.text, wajib: true) == null) 'koordinatSesudah': t(_koordinatSes),
        'asalSwitching': t(_asal),
      },
      'petugas1Id': _petugas1,
      if (_petugas2 != null) 'petugas2Id': _petugas2,
    };
  }

  Map<String, dynamic> _isiUbah() {
    const tidak = {'baId', 'jenis', 'tanggalBa'};
    return {
      'baId': _baId,
      'revision': (_detail?['revision'] as num?)?.toInt() ?? 0,
      for (final e in _isi().entries)
        if (!tidak.contains(e.key)) e.key: e.value,
    };
  }

  Map<String, dynamic>? _wmJson(_FotoGanti f) {
    final w = f.wm;
    if (w == null) return null;
    return {'ulp': w.ulp, 'bagian': w.slot, 'waktu': w.waktu.toIso8601String(), 'koordinat': w.koordinat, 'akurasiM': w.akurasiM, 'noGardu': w.kodeEksekusi};
  }

  Future<void> _simpan() async {
    if (_kirim) return;
    _form.currentState?.validate();
    final salah = _isianSalah();
    if (salah != null) {
      tampilPesan(context, salah.pesan);
      _gulirKe(salah.kartu);
      return;
    }
    if (_mengetahui.length != 1) {
      tampilPesan(context, 'Pejabat MENGETAHUI aktif harus tepat satu di db_Pejabat_BA. Hubungi pemilik sistem.');
      return;
    }
    if (AntreanBa.i.adaUntuk(_baId)) {
      tampilPesan(context, 'BA ini masih diproses di latar belakang. Tunggu selesai di Daftar BA.');
      return;
    }
    final foto = [
      for (final sl in slotFotoSwitching(_jenis))
        if (_foto[sl.$1] != null && !(_edit && _foto[sl.$1]!.server))
          FotoTugasBa(
            slot: sl.$1,
            label: sl.$2,
            path: _foto[sl.$1]!.path,
            sumber: _foto[sl.$1]!.sumber,
            asli: _foto[sl.$1]!.asli,
            wm: _wmJson(_foto[sl.$1]!),
            shaTerkirim: _foto[sl.$1]!.shaTerkirim,
          ),
    ];
    if (_edit && foto.isEmpty && !_kotor) {
      tampilPesan(context, 'Belum ada yang diubah.');
      return;
    }
    setState(() => _kirim = true);
    try {
      await AntreanBa.i.tambah(
        widget.deps,
        widget.sesi,
        TugasBa(
          baId: _baId,
          userId: widget.sesi.userId,
          mode: _edit ? 'UBAH' : 'BARU',
          jenis: _jenis,
          judul: '$_namaTampil · $_jenis',
          isi: _edit ? _isiUbah() : _isi(),
          foto: foto,
        ),
      );
    } catch (_) {
      if (mounted) {
        setState(() => _kirim = false);
        tampilPesan(context, 'BA gagal masuk antrean (penyimpanan HP). Coba lagi.');
      }
      return;
    }
    if (!mounted) return;
    _kotor = false;
    tampilPesan(context,
        _edit ? 'Perubahan BA dikirim di latar belakang, PDF dibuat ulang otomatis.' : 'BA dikirim di latar belakang: foto, simpan, lalu PDF. Pantau di Daftar BA.');
    Navigator.pop(context, true);
  }

  Future<bool> _bolehKeluar() async {
    if (!_kotor) return true;
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Buang isian BA?'),
        content: const Text('Isian dan foto yang belum disimpan akan hilang.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Lanjut isi')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Buang')),
        ],
      ),
    );
    return ok == true;
  }

  @override
  Widget build(BuildContext context) {
    final singkat = _jenis.replaceAll(' Switching', '');
    return PopScope(
      canPop: !_kotor && !_kirim,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop || _kirim) return;
        if (await _bolehKeluar() && context.mounted) {
          _kotor = false;
          Navigator.pop(context);
        }
      },
      child: Scaffold(
        backgroundColor: const Color(0xFFF6F8FC),
        appBar: sisiAppBar(_edit ? 'Edit BA $singkat' : 'BA $_jenis',
            subjudul: _edit ? '${_detail?['noGardu'] ?? 'Memuat'} · ${_detail?['idBa'] ?? ''}' : 'Nama switching diketik'),
        body: _edit && _detail == null
            ? (_galatDetail == null
                ? const SisiLoading(pesan: 'Memuat isian & foto BA...')
                : SisiKosong(
                    ikon: Icons.cloud_off_rounded, judul: 'BA tidak termuat', pesan: _galatDetail, tombol: 'Coba lagi', onTombol: _muatDetail))
            : Form(
                key: _form,
                child: SingleChildScrollView(
                  controller: _scroll,
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 120),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    KeyedSubtree(key: _kunci['identitas'], child: _kartuIdentitas()),
                    const SizedBox(height: 12),
                    KeyedSubtree(key: _kunci['switching'], child: _kartuSwitching()),
                    if (_sesudah) ...[
                      const SizedBox(height: 12),
                      KeyedSubtree(key: _kunci['sesudah'], child: _kartuSesudah()),
                    ],
                    const SizedBox(height: 12),
                    KeyedSubtree(key: _kunci['keterangan'], child: _kartuKeterangan()),
                    const SizedBox(height: 12),
                    KeyedSubtree(key: _kunci['foto'], child: _kartuFoto()),
                    const SizedBox(height: 12),
                    KeyedSubtree(key: _kunci['pemeriksa'], child: _kartuPemeriksa()),
                    const SizedBox(height: 18),
                    FilledButton.icon(
                      onPressed: _kirim ? null : _simpan,
                      icon: const Icon(Icons.save_rounded),
                      label: Text(_edit ? 'Simpan Perubahan' : 'Simpan Berita Acara'),
                      style: FilledButton.styleFrom(
                        minimumSize: const Size.fromHeight(50),
                        backgroundColor: AppColors.navy700,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _edit
                          ? 'ID BA, No BA, dan Tanggal BA tetap. Dikirim di latar belakang, PDF dibuat ulang otomatis.'
                          : 'Dikirim di latar belakang: nomor BA (SWC) dibuat server lalu PDF otomatis.',
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 11, color: AppColors.neutral500),
                    ),
                  ]),
                ),
              ),
      ),
    );
  }

  Widget _kartuIdentitas() {
    return SectionCard(judul: 'Identitas Berita Acara', ikon: Icons.badge_outlined, children: [
      if (_edit && '${_detail?['noBaFull'] ?? ''}'.isNotEmpty)
        Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: AppColors.cyan100, borderRadius: BorderRadius.circular(12)),
          child: Text('${_detail!['noBaFull']}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.navy900)),
        ),
      Row(children: [
        Expanded(child: _KolomTanggal(label: 'Tanggal BA', nilai: _tglBa, onTap: _edit ? null : () => _pilihTanggal(true))),
        const SizedBox(width: 10),
        Expanded(child: _KolomTanggal(label: 'Tanggal Pekerjaan', nilai: _tglKerja, onTap: () => _pilihTanggal(false))),
      ]),
    ]);
  }

  /// Penyulang + section (master jaringan).
  List<Widget> _lokasi({required bool sesudah}) {
    final pny = sesudah ? _pnySes : _pny;
    final secId = sesudah ? _sectionIdSes : _sectionId;
    final daftar = sesudah ? _sectionSes : _section;
    return [
      KolomPilih(
        key: ValueKey('pny-$sesudah-${_penyulang.length}-$pny'),
        label: 'Penyulang *',
        judulSheet: 'Pilih penyulang',
        pilihan: [for (final p in _penyulang) PilihanItem(p, p)],
        nilaiAwal: pny,
        selaluCari: true,
        validator: (v) => v == null ? 'Wajib dipilih' : null,
        onChanged: (v) => unawaited(_pilihPenyulang(v, sesudah: sesudah)),
      ),
      const SizedBox(height: 12),
      KolomPilih(
        key: ValueKey('sec-$sesudah-${daftar.length}-$secId'),
        label: 'Section *',
        judulSheet: 'Pilih section',
        pilihan: [for (final s in daftar) PilihanItem(s.id, s.nama)],
        nilaiAwal: secId,
        selaluCari: true,
        validator: (v) => v == null ? 'Wajib dipilih' : null,
        onChanged: (v) => _ubah(() => sesudah ? _sectionIdSes = v : _sectionId = v),
      ),
    ];
  }

  Widget _teks(TextEditingController c, String label, {String? Function(String?)? validator, int maks = 60, String? petunjuk}) => TextFormField(
        controller: c,
        maxLength: maks,
        buildCounter: (_, {required currentLength, required isFocused, maxLength}) => null,
        decoration: sisiInput(label).copyWith(hintText: petunjuk),
        validator: validator,
        onChanged: (_) => _kotor = true,
      );

  Widget _kartuSwitching() {
    return SectionCard(judul: _sesudah ? 'Data Switching Sebelum' : 'Data Switching', ikon: Icons.toggle_on_outlined, children: [
      KolomPilih(
        key: ValueKey('alat-$_jenisAlat'),
        label: 'Jenis Switching *',
        judulSheet: 'Jenis switching',
        pilihan: [for (final j in jenisAlatSwitching) PilihanItem(j, j)],
        nilaiAwal: _jenisAlat,
        validator: (v) => v == null ? 'Wajib dipilih' : null,
        onChanged: (v) => _ubah(() => _jenisAlat = v),
      ),
      const SizedBox(height: 12),
      _teks(_nama, 'Nama Switching *', validator: _wajib, maks: 100, petunjuk: 'mis. LBS SPBU Bukit'),
      const SizedBox(height: 12),
      ..._lokasi(sesudah: false),
      const SizedBox(height: 12),
      Row(children: [
        Expanded(child: _teks(_merk, 'Merk')),
        const SizedBox(width: 10),
        Expanded(child: _teks(_tipe, 'Tipe')),
      ]),
      const SizedBox(height: 12),
      _teks(_seri, 'Nomor Seri'),
      const SizedBox(height: 12),
      _teks(_koordinat, 'Koordinat', validator: _koordinatBoleh, maks: 40, petunjuk: '-3.012345, 106.456789'),
    ]);
  }

  Widget _kartuSesudah() {
    return SectionCard(judul: 'Data Switching Sesudah', ikon: Icons.swap_horiz_rounded, children: [
      KolomPilih(
        key: ValueKey('alat-ses-$_jenisAlatSes'),
        label: 'Jenis Switching Sesudah *',
        judulSheet: 'Jenis switching sesudah',
        pilihan: [for (final j in jenisAlatSwitching) PilihanItem(j, j)],
        nilaiAwal: _jenisAlatSes,
        validator: (v) => v == null ? 'Wajib dipilih' : null,
        onChanged: (v) => _ubah(() => _jenisAlatSes = v),
      ),
      const SizedBox(height: 12),
      _teks(_namaSes, 'Nama Switching Sesudah *', validator: _wajib, maks: 100),
      const SizedBox(height: 12),
      ..._lokasi(sesudah: true),
      const SizedBox(height: 12),
      Row(children: [
        Expanded(child: _teks(_merkSes, 'Merk Sesudah')),
        const SizedBox(width: 10),
        Expanded(child: _teks(_tipeSes, 'Tipe Sesudah')),
      ]),
      const SizedBox(height: 12),
      _teks(_seriSes, 'Nomor Seri Sesudah'),
      const SizedBox(height: 12),
      _teks(_koordinatSes, 'Koordinat Sesudah', validator: _koordinatBoleh, maks: 40, petunjuk: '-3.012345, 106.456789'),
      const SizedBox(height: 12),
      _teks(_asal, 'Asal Switching', maks: 80),
    ]);
  }

  Widget _kartuKeterangan() {
    return SectionCard(judul: 'Keterangan', ikon: Icons.sticky_note_2_outlined, children: [
      TextFormField(
        controller: _catatan,
        minLines: 2,
        maxLines: 5,
        maxLength: 500,
        decoration: sisiInput('Keterangan Tambahan'),
        onChanged: (_) => _kotor = true,
      ),
      if (switchingKerusakan(_jenis)) ...[
        const SizedBox(height: 6),
        TextFormField(
          controller: _kerusakan,
          minLines: 3,
          maxLines: 8,
          maxLength: 1000,
          decoration: sisiInput('Keterangan Kerusakan / Pemeriksaan'),
          onChanged: (_) => _kotor = true,
        ),
      ],
    ]);
  }

  Widget _kartuFoto() {
    final slot = slotFotoSwitching(_jenis);
    final wajib = slot.where((s) => s.$3).toList();
    final terisi = wajib.where((s) => _foto[s.$1] != null).length;
    return SectionCard(judul: 'Lampiran ($terisi/${wajib.length} wajib)', ikon: Icons.photo_camera_outlined, children: [
      ClipRRect(
        borderRadius: BorderRadius.circular(6),
        child: LinearProgressIndicator(
          value: wajib.isEmpty ? 1 : terisi / wajib.length,
          minHeight: 6,
          backgroundColor: AppColors.neutral100,
          color: terisi == wajib.length ? AppColors.success600 : AppColors.brand500,
        ),
      ),
      const SizedBox(height: 10),
      GridView.count(
        crossAxisCount: 2,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        childAspectRatio: 1.05,
        children: [
          for (final s in slot)
            _KotakFotoGanti(
              label: s.$2,
              wajib: s.$3,
              foto: _foto[s.$1],
              sibuk: _wmSlot == s.$1,
              onTap: _kirim || _wmSlot != null ? null : () => _ambilFoto(s.$1, s.$2),
            ),
        ],
      ),
    ]);
  }

  Widget _kartuPemeriksa() {
    final tahu = _mengetahui;
    if (_pejabat.isEmpty) {
      return SectionCard(judul: 'Pemeriksa', ikon: Icons.groups_outlined, children: [
        const Text('Daftar pejabat BA belum ada di HP. Download Master Gardu di Pengaturan (perlu internet).',
            style: TextStyle(fontSize: 12, color: AppColors.accent700, fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: () async {
            try {
              await widget.deps.gardu.segarkan(widget.sesi);
              await _muatMaster();
            } catch (e) {
              if (mounted) tampilPesan(context, _pesanGagal(e));
            }
          },
          icon: const Icon(Icons.download_rounded),
          label: const Text('Download sekarang'),
        ),
      ]);
    }
    return SectionCard(judul: 'Pemeriksa', ikon: Icons.groups_outlined, children: [
      KolomPilih(
        label: 'Petugas 1 *',
        judulSheet: 'Petugas 1',
        pilihan: [for (final p in _pemeriksa) PilihanItem('${p['id']}', '${p['nama']} · ${p['jabatan']}')],
        nilaiAwal: _petugas1,
        validator: (v) => v == null ? 'Wajib dipilih' : null,
        onChanged: (v) => _ubah(() {
          _petugas1 = v;
          if (_petugas2 == v) _petugas2 = null;
        }),
      ),
      const SizedBox(height: 12),
      KolomPilih(
        key: ValueKey('p2-$_petugas1-$_petugas2'),
        label: 'Petugas 2',
        judulSheet: 'Petugas 2 (opsional)',
        pilihan: [
          const PilihanItem(_tanpa, 'Tidak ada'),
          for (final p in _pemeriksa.where((p) => '${p['id']}' != _petugas1)) PilihanItem('${p['id']}', '${p['nama']} · ${p['jabatan']}'),
        ],
        nilaiAwal: _petugas2,
        onChanged: (v) => _ubah(() => _petugas2 = v == _tanpa ? null : v),
      ),
      const SizedBox(height: 12),
      Container(
        padding: const EdgeInsets.all(12),
        decoration:
            BoxDecoration(color: AppColors.neutral50, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.neutral200)),
        child: tahu.length == 1
            ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const SizedBox(width: 100, child: Text('Mengetahui', style: TextStyle(fontSize: 12, color: AppColors.neutral500))),
                Expanded(
                    child: Text('${tahu.first['nama']} · ${tahu.first['jabatan']}',
                        style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppColors.navy900))),
              ])
            : const Text('Pejabat MENGETAHUI aktif harus tepat satu di db_Pejabat_BA.',
                style: TextStyle(fontSize: 12, color: AppColors.red700, fontWeight: FontWeight.w600)),
      ),
    ]);
  }
}

class _KolomTanggal extends StatelessWidget {
  const _KolomTanggal({required this.label, required this.nilai, required this.onTap});
  final String label;
  final String nilai;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: InputDecorator(
          decoration:
              sisiInput(label, suffix: Icon(onTap == null ? Icons.lock_outline_rounded : Icons.calendar_month_rounded, color: AppColors.neutral500)),
          child: Text(DateFormat('d MMM yyyy', 'id_ID').format(DateTime.parse(nilai)),
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.navy900)),
        ),
      );
}

class _KotakFotoGanti extends StatelessWidget {
  const _KotakFotoGanti({required this.label, required this.wajib, required this.foto, required this.onTap, this.sibuk = false});
  final String label;
  final bool wajib;
  final _FotoGanti? foto;
  final VoidCallback? onTap;
  final bool sibuk;

  @override
  Widget build(BuildContext context) {
    final f = foto;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 250),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: f == null ? AppColors.neutral300 : AppColors.success600, width: f == null ? 1 : 2),
      ),
      child: Material(
        color: f == null ? AppColors.neutral50 : Colors.black,
        borderRadius: BorderRadius.circular(12),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Stack(fit: StackFit.expand, children: [
            if (f != null) Image.file(File(f.path), key: ValueKey(f.path), fit: BoxFit.cover, cacheWidth: 400),
            if (f == null)
              Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                Container(
                  width: 46,
                  height: 46,
                  decoration: const BoxDecoration(color: AppColors.brand100, shape: BoxShape.circle),
                  child: const Icon(Icons.add_a_photo_outlined, size: 24, color: AppColors.brand700),
                ),
                const SizedBox(height: 8),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Text(wajib ? '$label *' : label,
                      textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.navy900)),
                ),
                Text(wajib ? 'Ketuk untuk ambil' : 'Opsional', style: const TextStyle(fontSize: 10.5, color: AppColors.neutral500)),
              ]),
            if (f != null) ...[
              Positioned(
                top: 6,
                right: 6,
                child: Container(
                  padding: const EdgeInsets.all(3),
                  decoration: const BoxDecoration(color: AppColors.success600, shape: BoxShape.circle),
                  child: const Icon(Icons.check_rounded, size: 14, color: Colors.white),
                ),
              ),
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                  color: Colors.black54,
                  child: Row(children: [
                    Expanded(
                      child: Text(label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Colors.white)),
                    ),
                    const Icon(Icons.edit_rounded, size: 13, color: Colors.white70),
                  ]),
                ),
              ),
            ],
            if (sibuk)
              const ColoredBox(
                color: Color(0xB3FFFFFF),
                child: Center(child: SisiLoader(ukuran: 26)),
              ),
          ]),
        ),
      ),
    );
  }
}
