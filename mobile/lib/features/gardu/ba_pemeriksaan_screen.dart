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
import 'gardu_model.dart';
import '../../widgets/sisi_loader.dart';

/// v1.0.46: lampiran BA Pemeriksaan Trafo (v1: foto megger 1..6), semua opsional. PDF hanya memuat yang terisi.
const slotFotoPemeriksaan = <(String, String)>[
  ('LAMPIRAN_1', 'Lampiran 1'),
  ('LAMPIRAN_2', 'Lampiran 2'),
  ('LAMPIRAN_3', 'Lampiran 3'),
  ('LAMPIRAN_4', 'Lampiran 4'),
  ('LAMPIRAN_5', 'Lampiran 5'),
  ('LAMPIRAN_6', 'Lampiran 6'),
];

/// Cek kelengkapan BA Pemeriksaan Trafo. null = siap simpan.
String? cekKelengkapanPemeriksaanBa({required String? garduId, required String? petugas1Id}) {
  if (garduId == null || garduId.isEmpty) return 'Pilih gardu dari Master Gardu dulu.';
  if (petugas1Id == null) return 'Pilih Petugas 1.';
  return null;
}

class _FotoGanti {
  _FotoGanti(this.path, this.sumber, {this.asli, this.wm, this.server = false});
  String path;
  final String sumber;
  final bool server;
  final String? asli;
  DataWatermark? wm;
  String? shaTerkirim;
}

/// v1.0.46: Form Berita Acara Pemeriksaan Trafo, sama v1 (SIE-BeritaAcara.html + simpanBaPemeriksaanTrafo).
/// Gardu dari Master Gardu (data trafo & PHB-TR terisi otomatis, boleh dikoreksi), Kesimpulan + Catatan, Lampiran 1..6
/// opsional. Master Gardu tidak diubah.
class BaPemeriksaanScreen extends StatefulWidget {
  const BaPemeriksaanScreen({super.key, required this.deps, required this.sesi, this.ubahBaId});
  final Deps deps;
  final Sesi sesi;
  final String? ubahBaId;

  @override
  State<BaPemeriksaanScreen> createState() => _BaPemeriksaanScreenState();
}

class _BaPemeriksaanScreenState extends State<BaPemeriksaanScreen> {
  static const _jenis = 'Pemeriksaan Trafo';
  static const _tanpa = '__TANPA__';
  static const _lainnya = '__LAINNYA__';
  static const _lihat = '__LIHAT__';

  final _form = GlobalKey<FormState>();
  late final String _baId = widget.ubahBaId ?? const Uuid().v4();
  bool get _edit => widget.ubahBaId != null;
  Map<String, dynamic>? _detail;
  String? _galatDetail;
  late final BaRepository _repo = BaRepository(widget.deps.api);

  // Data Trafo Sebelum (dari Master Gardu, boleh dikoreksi)
  final _alamat = TextEditingController();
  final _koordinat = TextEditingController();
  final _kvaSeb = TextEditingController();
  final _merkSebLain = TextEditingController();
  final _seriSeb = TextEditingController();
  final _tahunSeb = TextEditingController();
  final _jurusanSeb = TextEditingController();
  final _merkPhbSeb = TextEditingController();
  final _seriPhbSeb = TextEditingController();
  final _tahunPhbSeb = TextEditingController();

  final _kesimpulan = TextEditingController();
  final _catatan = TextEditingController();

  List<Gardu> _daftarGardu = const [];
  Gardu? _gardu;
  String? _garduId;
  String _noGardu = '';
  String _tglBa = Wib.tanggal(DateTime.now());
  String _tglKerja = Wib.tanggal(DateTime.now());
  String _konstruksi = 'Portal';
  String? _kvaSebPilih;
  String? _merkSeb;
  List<int> _kvaOpsi = kvaStandarBa;
  String? _wmSlot;
  final _scroll = ScrollController();
  final _kunci = {
    for (final k in ['identitas', 'trafo', 'kesimpulan', 'foto', 'pemeriksa']) k: GlobalKey(),
  };
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
    for (final c in [
      _alamat,
      _koordinat,
      _kvaSeb,
      _merkSebLain,
      _seriSeb,
      _tahunSeb,
      _jurusanSeb,
      _merkPhbSeb,
      _seriPhbSeb,
      _tahunPhbSeb,
      _kesimpulan,
      _catatan,
    ]) {
      c.dispose();
    }
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _muatMaster() async {
    final pj = await widget.deps.gardu.pejabatBa();
    var gardu = const <Gardu>[];
    var kva = kvaStandarBa;
    try {
      gardu = await widget.deps.gardu.semua();
      kva = pilihanKvaBa(gardu.map((g) => g.kva));
    } catch (_) {/* master gardu belum diunduh */}
    if (!mounted) return;
    setState(() {
      _daftarGardu = gardu;
      _pejabat = pj;
      _kvaOpsi = kva;
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
      if (!mounted) return;
      String t(String k) => '${d[k] ?? ''}';
      String angka(Object? v) => v == null ? '' : (v is num && v == v.roundToDouble() ? '${v.toInt()}' : '$v'.replaceAll('.', ','));
      void aturKva(Object? raw, void Function(String?) setPilih, TextEditingController ctrl) {
        final n = raw is num ? raw : num.tryParse('$raw');
        final bulat = n != null && n == n.roundToDouble() ? n.toInt() : null;
        if (bulat != null && _kvaOpsi.contains(bulat)) {
          setPilih('$bulat');
        } else if (n != null) {
          setPilih(_lainnya);
          ctrl.text = angka(n);
        }
      }

      void aturMerk(String m, void Function(String?) setPilih, TextEditingController ctrl) {
        if (m.isEmpty) return;
        if (merkTrafoBa.contains(m)) {
          setPilih(m);
        } else {
          setPilih(_lainnya);
          ctrl.text = m;
        }
      }

      setState(() {
        _detail = d;
        _garduId = t('garduId');
        _noGardu = t('noGardu');
        _gardu = _daftarGardu.where((g) => g.id == _garduId || g.no == _noGardu).firstOrNull;
        _tglBa = t('tanggalBa').isEmpty ? _tglBa : t('tanggalBa');
        _tglKerja = t('tanggalPekerjaan').isEmpty ? _tglKerja : t('tanggalPekerjaan');
        _alamat.text = t('alamat');
        _koordinat.text = t('koordinat');
        _konstruksi = t('konstruksi') == 'Cantol' ? 'Cantol' : 'Portal';
        aturKva(d['kva'], (v) => _kvaSebPilih = v, _kvaSeb);
        aturMerk(t('merk'), (v) => _merkSeb = v, _merkSebLain);
        _seriSeb.text = t('seri');
        _tahunSeb.text = angka(d['tahun']);
        _jurusanSeb.text = angka(d['jurusan']);
        _merkPhbSeb.text = t('merkPhb');
        _seriPhbSeb.text = t('seriPhb');
        _tahunPhbSeb.text = angka(d['tahunPhb']);

        _kesimpulan.text = t('kesimpulan');
        _catatan.text = t('catatan');
        _petugas1 = t('petugas1Id').isEmpty ? null : t('petugas1Id');
        _petugas2 = t('petugas2Id').isEmpty ? null : t('petugas2Id');
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

  void _pilihGardu(String id) {
    final g = _daftarGardu.where((x) => x.id == id).firstOrNull;
    if (g == null) return;
    _ubah(() {
      _gardu = g;
      _garduId = g.id;
      _noGardu = g.no;
      _alamat.text = g.alamat;
      _koordinat.text = g.adaKoordinat ? Koordinat.format(g.lat!, g.lng!) : '';
      _konstruksi = g.konstruksi.toLowerCase() == 'cantol' ? 'Cantol' : 'Portal';
      final kvaBulat = g.kva != null && g.kva == g.kva!.roundToDouble() ? g.kva!.toInt() : null;
      if (kvaBulat != null && _kvaOpsi.contains(kvaBulat)) {
        _kvaSebPilih = '$kvaBulat';
        _kvaSeb.clear();
      } else if (g.kva != null) {
        _kvaSebPilih = _lainnya;
        _kvaSeb.text = angkaId(g.kva);
      } else {
        _kvaSebPilih = null;
        _kvaSeb.clear();
      }
      if (g.merk.isNotEmpty) {
        if (merkTrafoBa.contains(g.merk)) {
          _merkSeb = g.merk;
          _merkSebLain.clear();
        } else {
          _merkSeb = _lainnya;
          _merkSebLain.text = g.merk;
        }
      } else {
        _merkSeb = null;
        _merkSebLain.clear();
      }
      _seriSeb.text = g.seri;
      _tahunSeb.text = g.tahun == null ? '' : '${g.tahun}';
      _jurusanSeb.text = g.jurusan;
      _merkPhbSeb.text = g.merkPhb;
      _seriPhbSeb.text = g.seriPhb;
      _tahunPhbSeb.text = g.tahunPhb == null ? '' : '${g.tahunPhb}';
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
            subtitle: const Text('Watermark otomatis: No Gardu, bagian foto, tanggal, koordinat'),
            onTap: () => Navigator.pop(c, ImageSource.camera),
          ),
          ListTile(
            leading: const Icon(Icons.photo_library_outlined),
            title: const Text('Galeri'),
            subtitle: const Text('Tanpa watermark'),
            onTap: () => Navigator.pop(c, ImageSource.gallery),
          ),
          if (_foto[slot] != null)
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
      if (f != null) await lihatFoto(context, path: f.path, slot: label, keterangan: '$_noGardu · $label');
      return;
    }
    if (sumber == ImageSource.camera && _noGardu.isEmpty) {
      tampilPesan(context, 'Pilih gardu dari Master Gardu dulu supaya nomor gardu masuk watermark foto.');
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
        watermarkBa(ulp: widget.sesi.ulp, jenisBa: _jenis, noGardu: _noGardu, bagian: label, waktu: waktu, koordinat: koordinat, akurasiM: akurasi);
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

  ({String kartu, String pesan})? _isianSalah() {
    final tahunIni = DateTime.now().year;
    final aturan = <(String, String, String? Function())>[
      (
        'trafo',
        'Kapasitas',
        () => _kvaSebPilih == null ? 'Wajib dipilih' : (_kvaSebPilih == _lainnya ? cekAngkaBa(_kvaSeb.text, min: 1, max: 5000) : null)
      ),
      (
        'trafo',
        'Merk Trafo',
        () => _merkSeb == null ? 'Wajib dipilih' : (_merkSeb == _lainnya && _merkSebLain.text.trim().isEmpty ? 'Wajib diisi' : null)
      ),
      ('trafo', 'Nomor Seri', () => _wajib(_seriSeb.text)),
      ('trafo', 'Tahun Trafo', () => cekAngkaBa(_tahunSeb.text, min: 1950, max: tahunIni + 1, bulat: true)),
      ('trafo', 'Alamat', () => _wajib(_alamat.text)),
      ('trafo', 'Jumlah Jurusan', () => cekAngkaBa(_jurusanSeb.text, min: 1, max: 12, bulat: true)),
      ('trafo', 'Tahun PHB-TR', () => cekAngkaBa(_tahunPhbSeb.text, min: 1950, max: tahunIni + 1, wajib: false, bulat: true)),
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
    double? angka(TextEditingController c) => angkaIsianBa(c.text)?.toDouble();
    int? bulat(TextEditingController c) => angkaIsianBa(c.text)?.toInt();
    final merk = _merkSeb == _lainnya ? _merkSebLain.text.trim() : (_merkSeb ?? '');
    final tPhb = bulat(_tahunPhbSeb);
    return {
      'baId': _baId,
      'jenis': _jenis,
      'garduId': _garduId,
      'tanggalBa': _tglBa,
      'tanggalPekerjaan': _tglKerja,
      if (_gardu != null && _gardu!.sectionId.isNotEmpty) 'sectionId': _gardu!.sectionId,
      'alamat': _alamat.text.trim(),
      if (Koordinat.cek(_koordinat.text, wajib: true) == null) 'koordinat': _koordinat.text.trim(),
      'konstruksi': _konstruksi,
      'kva': _kvaSebPilih == _lainnya ? angka(_kvaSeb) : double.tryParse(_kvaSebPilih ?? ''),
      'merk': merk,
      'seri': _seriSeb.text.trim(),
      'tahun': bulat(_tahunSeb),
      'jurusan': bulat(_jurusanSeb),
      'merkPhb': _merkPhbSeb.text.trim(),
      'seriPhb': _seriPhbSeb.text.trim(),
      if (tPhb != null) 'tahunPhb': tPhb,
      'kesimpulan': _kesimpulan.text.trim(),
      'catatan': _catatan.text.trim(),
      'petugas1Id': _petugas1,
      if (_petugas2 != null) 'petugas2Id': _petugas2,
    };
  }

  Map<String, dynamic> _isiUbah() {
    final semua = _isi();
    const tidak = {'baId', 'jenis', 'garduId', 'tanggalBa'};
    return {
      'baId': _baId,
      'revision': (_detail?['revision'] as num?)?.toInt() ?? 0,
      for (final e in semua.entries)
        if (!tidak.contains(e.key)) e.key: e.value,
    };
  }

  Map<String, dynamic>? _wmJson(_FotoGanti f) {
    final w = f.wm;
    if (w == null) return null;
    return {
      'ulp': w.ulp,
      'bagian': w.slot,
      'waktu': w.waktu.toIso8601String(),
      'koordinat': w.koordinat,
      'akurasiM': w.akurasiM,
      'noGardu': w.kodeEksekusi
    };
  }

  Future<void> _simpan() async {
    if (_kirim) return;
    _form.currentState?.validate();
    final salah = _isianSalah();
    final kurang = cekKelengkapanPemeriksaanBa(garduId: _garduId, petugas1Id: _petugas1);
    if (salah != null || kurang != null) {
      tampilPesan(context, salah?.pesan ?? kurang!);
      _gulirKe(salah?.kartu ?? (_garduId == null ? 'identitas' : 'pemeriksa'));
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
      for (final sl in slotFotoPemeriksaan)
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
      final tugas = TugasBa(
        baId: _baId,
        userId: widget.sesi.userId,
        mode: _edit ? 'UBAH' : 'BARU',
        jenis: _jenis,
        judul: '$_noGardu · $_jenis',
        isi: _edit ? _isiUbah() : _isi(),
        foto: foto,
      );
      await AntreanBa.i.tambah(widget.deps, widget.sesi, tugas);
    } catch (_) {
      if (mounted) {
        setState(() => _kirim = false);
        tampilPesan(context, 'BA gagal masuk antrean (penyimpanan HP). Coba lagi.');
      }
      return;
    }
    if (!mounted) return;
    _kotor = false;
    tampilPesan(
        context,
        _edit
            ? 'Perubahan BA dikirim di latar belakang, PDF dibuat ulang otomatis.'
            : 'BA dikirim di latar belakang: lampiran, simpan, lalu PDF. Pantau di Daftar BA.');
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
    final tahunIni = DateTime.now().year;
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
        appBar: sisiAppBar(_edit ? 'Edit BA Pemeriksaan' : 'BA Pemeriksaan Trafo',
            subjudul: _edit ? '${_detail?['noGardu'] ?? 'Memuat'} · ${_detail?['idBa'] ?? ''}' : 'Pilih dari Master Gardu'),
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
                    KeyedSubtree(key: _kunci['trafo'], child: _kartuTrafo(tahunIni)),
                    const SizedBox(height: 12),
                    KeyedSubtree(key: _kunci['kesimpulan'], child: _kartuKesimpulan()),
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
                          ? 'Nomor Gardu, ID BA, No BA, dan Tanggal BA tetap. Dikirim di latar belakang, PDF dibuat ulang otomatis.'
                          : 'Dikirim di latar belakang: nomor BA dibuat server lalu PDF otomatis. Master Gardu tidak berubah.',
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
      if (!_edit)
        KolomPilih(
          key: ValueKey('grd-${_daftarGardu.length}-$_garduId'),
          label: 'Pilih Gardu (Master Gardu) *',
          judulSheet: 'Pilih Gardu yang Diperiksa',
          keteranganSheet: 'Data Trafo & PHB-TR otomatis terisi dari Master Gardu.',
          pilihan: [
            for (final g in _daftarGardu)
              PilihanItem(g.id, '${g.no} · ${g.kva == null ? '-' : '${angkaId(g.kva)} kVA'} · ${g.alamat.isEmpty ? g.penyulang : g.alamat}'),
          ],
          nilaiAwal: _garduId,
          selaluCari: true,
          validator: (v) => v == null ? 'Wajib dipilih' : null,
          onChanged: _pilihGardu,
        )
      else
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: AppColors.cyan100, borderRadius: BorderRadius.circular(12)),
          child: Row(children: [
            const Icon(Icons.tag_rounded, color: AppColors.navy700),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(_noGardu, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: AppColors.navy900)),
                if ('${_detail?['noBaFull'] ?? ''}'.isNotEmpty)
                  Text('${_detail!['noBaFull']}', style: const TextStyle(fontSize: 11, color: AppColors.neutral700)),
              ]),
            ),
          ]),
        ),
      const SizedBox(height: 12),
      Row(children: [
        Expanded(child: _KolomTanggal(label: 'Tanggal BA', nilai: _tglBa, onTap: _edit ? null : () => _pilihTanggal(true))),
        const SizedBox(width: 10),
        Expanded(child: _KolomTanggal(label: 'Tanggal Pekerjaan', nilai: _tglKerja, onTap: () => _pilihTanggal(false))),
      ]),
    ]);
  }

  Widget _kartuTrafo(int tahunIni) {
    return SectionCard(judul: 'Data Trafo & PHB-TR', ikon: Icons.electrical_services_rounded, children: [
      KolomPilih(
        key: ValueKey('kva-seb-${_kvaOpsi.length}-$_kvaSebPilih'),
        label: 'Kapasitas (kVA) *',
        judulSheet: 'Kapasitas trafo',
        pilihan: [for (final k in _kvaOpsi) PilihanItem('$k', '$k kVA'), const PilihanItem(_lainnya, 'Lainnya (ketik)')],
        nilaiAwal: _kvaSebPilih,
        validator: (v) => v == null ? 'Wajib dipilih' : null,
        onChanged: (v) => _ubah(() => _kvaSebPilih = v),
      ),
      if (_kvaSebPilih == _lainnya) ...[
        const SizedBox(height: 10),
        TextFormField(
          controller: _kvaSeb,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: sisiInput('Kapasitas lainnya (kVA) *'),
          validator: (v) => cekAngkaBa(v, min: 1, max: 5000),
          onChanged: (_) => _kotor = true,
        ),
      ],
      const SizedBox(height: 12),
      KolomPilih(
        key: ValueKey('merk-seb-$_merkSeb'),
        label: 'Merk *',
        judulSheet: 'Merk trafo',
        pilihan: [for (final m in merkTrafoBa) PilihanItem(m, m), const PilihanItem(_lainnya, 'Lainnya (ketik)')],
        nilaiAwal: _merkSeb,
        selaluCari: true,
        validator: (v) => v == null ? 'Wajib dipilih' : null,
        onChanged: (v) => _ubah(() => _merkSeb = v),
      ),
      if (_merkSeb == _lainnya) ...[
        const SizedBox(height: 10),
        TextFormField(controller: _merkSebLain, decoration: sisiInput('Merk lainnya *'), validator: _wajib, onChanged: (_) => _kotor = true),
      ],
      const SizedBox(height: 12),
      Row(children: [
        Expanded(
          flex: 3,
          child: TextFormField(controller: _seriSeb, decoration: sisiInput('Nomor Seri *'), validator: _wajib, onChanged: (_) => _kotor = true),
        ),
        const SizedBox(width: 10),
        Expanded(
          flex: 2,
          child: TextFormField(
            controller: _tahunSeb,
            keyboardType: TextInputType.number,
            decoration: sisiInput('Tahun *'),
            validator: (v) => cekAngkaBa(v, min: 1950, max: tahunIni + 1, bulat: true),
            onChanged: (_) => _kotor = true,
          ),
        ),
      ]),
      const SizedBox(height: 12),
      const Text('Konstruksi', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: AppColors.neutral500)),
      const SizedBox(height: 6),
      SegmentedButton<String>(
        showSelectedIcon: false,
        segments: const [ButtonSegment(value: 'Portal', label: Text('Portal')), ButtonSegment(value: 'Cantol', label: Text('Cantol'))],
        selected: {_konstruksi},
        onSelectionChanged: (v) => _ubah(() => _konstruksi = v.first),
      ),
      const SizedBox(height: 12),
      TextFormField(controller: _alamat, maxLines: 2, decoration: sisiInput('Alamat *'), validator: _wajib, onChanged: (_) => _kotor = true),
      const SizedBox(height: 12),
      const Divider(),
      const SizedBox(height: 6),
      const Text('DATA PHB-TR', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: AppColors.navy700)),
      const SizedBox(height: 8),
      Row(children: [
        Expanded(
          child: TextFormField(controller: _merkPhbSeb, decoration: sisiInput('Merk PHB-TR'), onChanged: (_) => _kotor = true),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: TextFormField(controller: _seriPhbSeb, decoration: sisiInput('Nomor Seri PHB-TR'), onChanged: (_) => _kotor = true),
        ),
      ]),
      const SizedBox(height: 10),
      Row(children: [
        Expanded(
          child: TextFormField(
            controller: _tahunPhbSeb,
            keyboardType: TextInputType.number,
            decoration: sisiInput('Tahun PHB-TR'),
            validator: (v) => cekAngkaBa(v, min: 1950, max: tahunIni + 1, wajib: false, bulat: true),
            onChanged: (_) => _kotor = true,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: TextFormField(
            controller: _jurusanSeb,
            keyboardType: TextInputType.number,
            decoration: sisiInput('Jumlah Jurusan *'),
            validator: (v) => cekAngkaBa(v, min: 1, max: 12, bulat: true),
            onChanged: (_) => _kotor = true,
          ),
        ),
      ]),
    ]);
  }

  Widget _kartuKesimpulan() {
    return SectionCard(judul: 'Kesimpulan & Catatan', ikon: Icons.fact_check_outlined, children: [
      TextFormField(
        controller: _kesimpulan,
        minLines: 3,
        maxLines: 8,
        maxLength: 1000,
        decoration: sisiInput('Kesimpulan'),
        onChanged: (_) => _kotor = true,
      ),
      const SizedBox(height: 6),
      TextFormField(
        controller: _catatan,
        minLines: 2,
        maxLines: 6,
        maxLength: 1000,
        decoration: sisiInput('Catatan'),
        onChanged: (_) => _kotor = true,
      ),
      const Text('Kosong = tidak dicetak di PDF.', style: TextStyle(fontSize: 11, color: AppColors.neutral500)),
    ]);
  }

  Widget _kartuFoto() {
    final terisi = slotFotoPemeriksaan.where((s) => _foto[s.$1] != null).length;
    return SectionCard(judul: 'Lampiran Pemeriksaan ($terisi/6, opsional)', ikon: Icons.photo_camera_outlined, children: [
      const Text('Foto hasil pengujian (mis. megger). Yang tidak diisi tidak dicetak; PDF tanpa lampiran = 1 halaman.',
          style: TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
      const SizedBox(height: 10),
      GridView.count(
        crossAxisCount: 2,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        childAspectRatio: 1.05,
        children: [
          for (final s in slotFotoPemeriksaan)
            _KotakFotoGanti(
              label: s.$2,
              wajib: false,
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
