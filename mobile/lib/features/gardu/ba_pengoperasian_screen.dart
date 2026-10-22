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

/// Merk trafo (sama v1 BA_MERK_TRAFO). "Lainnya" = ketik sendiri.
const merkTrafoBa = <String>[
  'Alsthom Atlantique', 'Amtra Electric', 'B&D', 'Centrado', 'J&P', 'Lucky Light', 'Mastergreen', 'Maxima', 'Monata', 'Morawa',
  'Trafindo', 'Trafoindo', 'Triputra Electric Abadi', 'Schneider', 'Shenyang', 'Sintra', 'Starlite', 'Unindo', 'Voltra', 'Weltraf',
];

/// Slot foto Pengoperasian Trafo (urutan + label sama v1). Kunci = slot server.
const slotFotoPengoperasian = <(String, String)>[
  ('NAMEPLATE', 'Nameplate Trafo'),
  ('FULL_GARDU', 'Foto Full Gardu'),
  ('NAMEPLATE_PHB', 'Nameplate PHB-TR'),
  ('BOX_PHB', 'Box PHB-TR'),
];

/// Pesan isian yang belum lengkap (selain validator kolom). null = siap simpan. Murni, bisa dites.
String? cekKelengkapanBa({required String? prefix, required String? sectionId, required String? petugas1Id, required Set<String> slotTerisi}) {
  if (prefix == null) return 'Pilih kode gardu (prefix) dulu.';
  if (sectionId == null) return 'Pilih penyulang dan section.';
  final kurang = [for (final s in slotFotoPengoperasian) if (!slotTerisi.contains(s.$1)) s.$2];
  if (kurang.isNotEmpty) return 'Foto belum lengkap: ${kurang.join(', ')}.';
  if (petugas1Id == null) return 'Pilih Petugas 1.';
  return null;
}

class _Foto {
  _Foto(this.path, this.sumber, {this.asli, this.wm, this.server = false});
  String path; // yang dikirim / ditampilkan (kamera = sudah ber-watermark)
  final String sumber; // KAMERA | GALERI | SERVER (v0.76.0: foto BA tersimpan, diunduh untuk edit)
  final bool server;
  final String? asli; // kamera: foto asli tanpa watermark (render ulang kalau No Gardu berubah)
  DataWatermark? wm;
  String? shaTerkirim;
}

/// v0.70.0 (keputusan kvlar 9 Okt 2026): form BA Pengoperasian Trafo (format kartu v1). Wajib online.
/// Nomor gardu, ID BA, No BA Full ditentukan server saat simpan. Foto boleh kamera atau galeri.
/// v0.76.0: Simpan = masuk antrean latar belakang (AntreanBa), form langsung tertutup. [ubahBaId] = edit BA tersimpan
/// (nomor gardu, ID BA, No BA, Tanggal BA tetap; foto lama diunduh lewat server, yang diganti saja yang dikirim).
class BaPengoperasianScreen extends StatefulWidget {
  const BaPengoperasianScreen({super.key, required this.deps, required this.sesi, this.ubahBaId});
  final Deps deps;
  final Sesi sesi;
  final String? ubahBaId;

  @override
  State<BaPengoperasianScreen> createState() => _BaPengoperasianScreenState();
}

class _BaPengoperasianScreenState extends State<BaPengoperasianScreen> {
  static const _jenis = 'Pengoperasian Trafo';
  static const _tanpa = '__TANPA__';
  static const _lainnya = '__LAINNYA__';
  static const _lihat = '__LIHAT__';

  final _form = GlobalKey<FormState>();
  late final String _baId = widget.ubahBaId ?? const Uuid().v4();
  bool get _edit => widget.ubahBaId != null;
  Map<String, dynamic>? _detail; // v0.76.0: isian BA tersimpan (mode edit)
  String? _galatDetail;
  late final BaRepository _repo = BaRepository(widget.deps.api);

  final _alamat = TextEditingController();
  final _koordinat = TextEditingController();
  final _kva = TextEditingController(); // kVA "Lainnya"
  final _merkLain = TextEditingController();
  final _seri = TextEditingController();
  final _tahun = TextEditingController();
  final _jurusan = TextEditingController();
  final _merkPhb = TextEditingController();
  final _seriPhb = TextEditingController();
  final _tahunPhb = TextEditingController();
  final _perluasan = TextEditingController();
  final _vendor = TextEditingController();
  final _catatan = TextEditingController();

  String? _prefix;
  Map<String, dynamic>? _nomor; // jawaban getNomorGarduBaru
  bool _muatNomor = false;
  String? _pakaiBatalId;
  bool _lewatiBatal = false;
  String _tglBa = Wib.tanggal(DateTime.now());
  String _tglKerja = Wib.tanggal(DateTime.now());
  List<String> _penyulang = const [];
  List<({String id, String nama})> _section = const [];
  String? _pny;
  String? _sectionId;
  Map<String, dynamic>? _owner;
  bool _muatOwner = false;
  String _konstruksi = 'Portal';
  String _kepemilikan = 'PLN';
  String? _merk;
  String? _kvaPilih; // nilai dropdown kVA ('100' / _lainnya)
  List<int> _kvaOpsi = kvaStandarBa;
  double? _akurasi; // ada = koordinat dari tombol GPS (chip akurasi); diketik manual = null
  String _koordinatGps = '';
  String? _wmSlot; // slot yang sedang dipasang watermark (spinner di kotak foto)
  final _scroll = ScrollController();
  final _kunci = {for (final k in ['identitas', 'trafo', 'phb', 'operasi', 'foto', 'pemeriksa']) k: GlobalKey()};
  final Map<String, _Foto> _foto = {};
  List<Map<String, dynamic>> _pejabat = const [];
  String? _petugas1;
  String? _petugas2;
  bool _gps = false;
  bool _kirim = false;
  bool _kotor = false;

  @override
  void initState() {
    super.initState();
    unawaited(_muatMaster().then((_) => _edit ? _muatDetail() : null));
  }

  /// v0.76.0: isi form dari BA tersimpan + unduh fotonya lewat server (bukan Drive).
  Future<void> _muatDetail() async {
    setState(() => _galatDetail = null);
    try {
      final d = await _repo.detail(widget.sesi, _baId);
      final dir = await getTemporaryDirectory();
      final foto = <String, _Foto>{};
      for (final sl in (d['foto'] as List<dynamic>? ?? const <dynamic>[]).map((e) => '$e')) {
        final b = await _repo.foto(widget.sesi, _baId, sl);
        final f = File('${dir.path}/ba_edit_${_baId.substring(0, 8)}_${sl}_${DateTime.now().millisecondsSinceEpoch}.jpg');
        await f.writeAsBytes(b, flush: true);
        foto[sl] = _Foto(f.path, 'SERVER', server: true);
      }
      final pny = '${d['penyulang'] ?? ''}';
      final section = pny.isEmpty ? const <({String id, String nama})>[] : await widget.deps.master.section(pny);
      if (!mounted) return;
      String t(String k) => '${d[k] ?? ''}';
      String angka(Object? v) => v == null ? '' : (v is num && v == v.roundToDouble() ? '${v.toInt()}' : '$v'.replaceAll('.', ','));
      final kvaN = d['kva'] as num?;
      final kva = kvaN != null && kvaN == kvaN.roundToDouble() ? kvaN.toInt() : null;
      final merk = t('merk');
      setState(() {
        _detail = d;
        final no = t('noGardu');
        _prefix = no.length >= 2 ? no.substring(0, 2) : null;
        _nomor = {'nomor': no};
        _tglBa = t('tanggalBa').isEmpty ? _tglBa : t('tanggalBa');
        _tglKerja = t('tanggalPekerjaan').isEmpty ? _tglKerja : t('tanggalPekerjaan');
        _pny = pny.isEmpty ? null : pny;
        _section = section;
        _sectionId = t('sectionId').isEmpty ? null : t('sectionId');
        _owner = {'ownerId': d['ownerId'] ?? '', 'externalReference': d['externalReference'] ?? '', 'ditemukan': true};
        _alamat.text = t('alamat');
        _koordinat.text = t('koordinat');
        _konstruksi = t('konstruksi') == 'Cantol' ? 'Cantol' : 'Portal';
        _kepemilikan = t('kepemilikan').startsWith('Non') ? 'Non-PLN' : 'PLN';
        if (kva != null && _kvaOpsi.contains(kva)) {
          _kvaPilih = '$kva';
        } else if (d['kva'] != null) {
          _kvaPilih = _lainnya;
          _kva.text = angka(d['kva']);
        }
        if (merk.isNotEmpty) {
          _merk = merkTrafoBa.contains(merk) ? merk : _lainnya;
          if (_merk == _lainnya) _merkLain.text = merk;
        }
        _seri.text = t('seri');
        _tahun.text = angka(d['tahun']);
        _jurusan.text = angka(d['jurusan']);
        _merkPhb.text = t('merkPhb');
        _seriPhb.text = t('seriPhb');
        _tahunPhb.text = angka(d['tahunPhb']);
        _perluasan.text = angka(d['perluasanSutm']);
        _vendor.text = t('vendor');
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

  @override
  void dispose() {
    for (final c in [_alamat, _koordinat, _kva, _merkLain, _seri, _tahun, _jurusan, _merkPhb, _seriPhb, _tahunPhb, _perluasan, _vendor, _catatan]) {
      c.dispose();
    }
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _muatMaster() async {
    final p = await widget.deps.master.penyulang();
    final pj = await widget.deps.gardu.pejabatBa();
    var kva = kvaStandarBa;
    try {
      kva = pilihanKvaBa((await widget.deps.gardu.semua()).map((g) => g.kva));
    } catch (_) {/* master gardu belum diunduh: kVA standar */}
    if (!mounted) return;
    setState(() {
      _penyulang = p;
      _pejabat = pj;
      _kvaOpsi = kva;
    });
  }

  List<Map<String, dynamic>> get _pemeriksa => _pejabat.where((p) => p['peran'] == 'PEMERIKSA').toList();
  List<Map<String, dynamic>> get _mengetahui => _pejabat.where((p) => p['peran'] == 'MENGETAHUI').toList();

  void _ubah(VoidCallback f) => setState(() {
        f();
        _kotor = true;
      });

  String _pesanGagal(Object e) => e is ApiException ? KodeError.pesan(e.kode) : 'Gagal terhubung. Cek sinyal lalu coba lagi.';

  Future<void> _pilihPrefix(String p) async {
    _ubah(() {
      _prefix = p;
      _nomor = null;
      _pakaiBatalId = null;
      _lewatiBatal = false;
    });
    await _pesanNomor();
  }

  /// v0.73.0: pesan nomor ke server (prefix + pilihan BATAL sekarang). Watermark foto kamera ikut nomor pesanan.
  Future<void> _pesanNomor({String? batalId}) async {
    final p = _prefix;
    if (p == null) return;
    setState(() => _muatNomor = true);
    try {
      final n = await _repo.pesanNomor(widget.sesi, baId: _baId, prefix: p, nomorBatalId: batalId);
      if (!mounted || _prefix != p) return;
      setState(() {
        _nomor = n;
        _pakaiBatalId = n['asal'] == 'ULANG BATAL' ? '${n['garduId']}' : null;
      });
      await _renderUlangWatermark();
    } catch (e) {
      if (mounted) tampilPesan(context, _pesanGagal(e));
    } finally {
      if (mounted) setState(() => _muatNomor = false);
    }
  }

  Future<void> _pilihPenyulang(String p) async {
    _ubah(() {
      _pny = p;
      _sectionId = null;
      _section = const [];
      _owner = null;
    });
    final s = await widget.deps.master.section(p);
    if (mounted && _pny == p) setState(() => _section = s);
  }

  Future<void> _pilihSection(String id) async {
    _ubah(() {
      _sectionId = id;
      _owner = null;
      _muatOwner = true;
    });
    try {
      final o = await _repo.ownerId(widget.sesi, id);
      if (mounted && _sectionId == id) setState(() => _owner = o);
    } catch (e) {
      if (mounted) tampilPesan(context, _pesanGagal(e));
    } finally {
      if (mounted) setState(() => _muatOwner = false);
    }
  }

  Future<void> _ambilGps() async {
    setState(() => _gps = true);
    try {
      final siap = await Gps.siapkan();
      if (siap != null) {
        if (mounted) tampilPesan(context, siap);
        return;
      }
      final p = await Gps.sampelPertama();
      if (!mounted) return;
      if (p == null) {
        tampilPesan(context, 'Lokasi belum didapat. Coba lagi di tempat terbuka.');
      } else if (p.isMocked) {
        tampilPesan(context, 'Lokasi palsu (fake GPS) terdeteksi. Matikan aplikasi lokasi palsu.');
      } else {
        _ubah(() {
          _koordinat.text = Koordinat.format(p.latitude, p.longitude);
          _koordinatGps = _koordinat.text;
          _akurasi = p.accuracy;
        });
      }
    } finally {
      if (mounted) setState(() => _gps = false);
    }
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
          // v0.76.0: review foto (perbesar, watermark terbaca) sebelum diganti / dikirim
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
      if (f != null) await lihatFoto(context, path: f.path, slot: label, keterangan: '$_noGarduTampil · $label');
      return;
    }
    if (sumber == ImageSource.camera && _nomor == null) {
      tampilPesan(context, 'Pilih Kode Gardu (prefix) dulu: nomor gardu dipesan dari server lalu masuk watermark foto.');
      return;
    }
    if (sumber is! ImageSource) return;
    final x = await FotoRepository.ambil(sumber);
    if (x == null || !mounted) return;
    if (sumber == ImageSource.gallery) {
      _ubah(() => _foto[slot] = _Foto(x.path, 'GALERI'));
      return;
    }
    // v0.72.0: kamera = watermark dibakar SESUDAH jepret, ukuran mengikuti rasio foto (potret / lanskap)
    final waktu = DateTime.now();
    setState(() => _wmSlot = slot);
    var koordinat = Koordinat.cek(_koordinat.text, wajib: true) == null ? _koordinat.text.trim() : '';
    double? akurasi = koordinat.isNotEmpty && koordinat == _koordinatGps ? _akurasi : null;
    if (koordinat.isEmpty) {
      final p = await Gps.sampelPertama(batas: const Duration(seconds: 8));
      if (p != null && !p.isMocked) {
        koordinat = Koordinat.format(p.latitude, p.longitude);
        akurasi = p.accuracy;
      }
    }
    final wm = watermarkBa(
        ulp: widget.sesi.ulp, jenisBa: _jenis, noGardu: _noGarduTampil, bagian: label, waktu: waktu, koordinat: koordinat, akurasiM: akurasi);
    try {
      final jadi = await pasangWatermarkBa(x.path, wm, '${_baId.substring(0, 8)}_$slot');
      if (!mounted) return;
      _ubah(() => _foto[slot] = _Foto(jadi, 'KAMERA', asli: x.path, wm: wm));
    } catch (_) {
      if (mounted) tampilPesan(context, 'Watermark gagal dipasang. Coba ambil foto lagi.');
    } finally {
      if (mounted) setState(() => _wmSlot = null);
    }
  }

  /// No Gardu pesanan BA ini (v0.73.0: nomor dari server, bukan perkiraan).
  String get _noGarduTampil => '${_nomor?['nomor'] ?? '-'}';

  /// Foto kamera yang watermark-nya bukan nomor pesanan sekarang = dirender ulang dari foto asli (dikirim ulang).
  Future<void> _renderUlangWatermark() async {
    final no = _noGarduTampil;
    for (final e in _foto.entries) {
      final f = e.value, wm = f.wm, asli = f.asli;
      if (wm == null || asli == null || wm.kodeEksekusi == no) continue;
      final baru = watermarkBa(
          ulp: wm.ulp, jenisBa: _jenis, noGardu: no, bagian: wm.slot, waktu: wm.waktu, koordinat: wm.koordinat, akurasiM: wm.akurasiM);
      f.path = await pasangWatermarkBa(asli, baru, '${_baId.substring(0, 8)}_${e.key}');
      f.wm = baru;
      f.shaTerkirim = null;
    }
  }

  Map<String, dynamic> _isi(String installId) {
    final merk = _merk == _lainnya ? _merkLain.text.trim() : (_merk ?? '');
    double? angka(TextEditingController c) => angkaIsianBa(c.text)?.toDouble();
    int? bulat(TextEditingController c) => angkaIsianBa(c.text)?.toInt();
    return {
      'baId': _baId,
      'jenis': _jenis,
      'prefix': _prefix,
      if (_pakaiBatalId != null) 'nomorBatalId': _pakaiBatalId,
      if (_foto.values.any((f) => f.wm != null)) 'noGarduWatermark': _noGarduTampil,
      'tanggalBa': _tglBa,
      'tanggalPekerjaan': _tglKerja,
      'sectionId': _sectionId,
      'alamat': _alamat.text.trim(),
      'koordinat': _koordinat.text.trim(),
      'konstruksi': _konstruksi,
      'kva': _kvaPilih == _lainnya ? angka(_kva) : double.tryParse(_kvaPilih ?? ''),
      'merk': merk,
      'seri': _seri.text.trim(),
      'tahun': bulat(_tahun),
      'jurusan': bulat(_jurusan),
      if (_merkPhb.text.trim().isNotEmpty) 'merkPhb': _merkPhb.text.trim(),
      if (_seriPhb.text.trim().isNotEmpty) 'seriPhb': _seriPhb.text.trim(),
      if (bulat(_tahunPhb) != null) 'tahunPhb': bulat(_tahunPhb),
      'kepemilikan': _kepemilikan,
      if (angka(_perluasan) != null) 'perluasanSutm': angka(_perluasan),
      if (_vendor.text.trim().isNotEmpty) 'vendor': _vendor.text.trim(),
      if (_catatan.text.trim().isNotEmpty) 'catatan': _catatan.text.trim(),
      'petugas1Id': _petugas1,
      if (_petugas2 != null) 'petugas2Id': _petugas2,
      'installId': installId,
    };
  }

  /// Isian angka / wajib yang salah, urut dari atas form: (kartu, pesan). Kolom di luar layar tetap dicek di sini.
  ({String kartu, String pesan})? _isianSalah() {
    final tahunIni = DateTime.now().year;
    final aturan = <(String, String, String? Function())>[
      ('trafo', 'Kapasitas', () => _kvaPilih == null ? 'Wajib dipilih' : (_kvaPilih == _lainnya ? cekAngkaBa(_kva.text, min: 1, max: 5000) : null)),
      ('trafo', 'Merk trafo', () => _merk == null ? 'Wajib dipilih' : (_merk == _lainnya && _merkLain.text.trim().isEmpty ? 'Wajib diisi' : null)),
      ('trafo', 'Nomor Seri', () => _wajib(_seri.text)),
      ('trafo', 'Tahun trafo', () => cekAngkaBa(_tahun.text, min: 1950, max: tahunIni + 1, bulat: true)),
      ('trafo', 'Koordinat Trafo', () => Koordinat.cek(_koordinat.text, wajib: true)),
      ('trafo', 'Jurusan Terpasang', () => cekAngkaBa(_jurusan.text, min: 1, max: 12, bulat: true)),
      ('trafo', 'Alamat', () => _wajib(_alamat.text)),
      ('phb', 'Tahun PHB-TR', () => cekAngkaBa(_tahunPhb.text, min: 1950, max: tahunIni + 1, wajib: false, bulat: true)),
      ('operasi', 'Panjang Perluasan SUTM', () => cekAngkaBa(_perluasan.text, min: 0, max: 100, wajib: false)),
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

  /// Data foto kamera untuk render ulang watermark di antrean (No Gardu pesanan berubah).
  Map<String, dynamic>? _wmJson(_Foto f) {
    final w = f.wm;
    if (w == null) return null;
    return {'ulp': w.ulp, 'bagian': w.slot, 'waktu': w.waktu.toIso8601String(), 'koordinat': w.koordinat, 'akurasiM': w.akurasiM, 'noGardu': w.kodeEksekusi};
  }

  /// Isian ubahBaGardu (edit): tanpa prefix / nomor / tanggal BA / jenis.
  Map<String, dynamic> _isiUbah() {
    final semua = _isi('');
    const tidak = {'baId', 'jenis', 'prefix', 'nomorBatalId', 'noGarduWatermark', 'tanggalBa', 'installId'};
    return {
      'baId': _baId,
      'revision': (_detail?['revision'] as num?)?.toInt() ?? 0,
      for (final e in semua.entries)
        if (!tidak.contains(e.key)) e.key: e.value,
    };
  }

  /// v0.76.0: Simpan = cek isian di HP, lalu masuk antrean latar belakang (kirim foto > simpan > PDF). Form langsung tertutup.
  Future<void> _simpan() async {
    if (_kirim) return;
    _form.currentState?.validate(); // tandai merah semua kolom (form tidak lagi lazy, semua kolom ikut dicek)
    final salah = _isianSalah();
    final kurang = cekKelengkapanBa(prefix: _prefix, sectionId: _sectionId, petugas1Id: _petugas1, slotTerisi: _foto.keys.toSet());
    if (salah != null || kurang != null) {
      tampilPesan(context, salah?.pesan ?? kurang!);
      _gulirKe(salah?.kartu ??
          (_prefix == null ? 'identitas' : _sectionId == null ? 'trafo' : _foto.length < slotFotoPengoperasian.length ? 'foto' : 'pemeriksa'));
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
      for (final sl in slotFotoPengoperasian)
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
        judul: '$_noGarduTampil · $_jenis',
        isi: _edit ? _isiUbah() : (_isi('')..remove('installId')),
        foto: foto,
        prefix: _edit ? null : _prefix,
        batalId: _pakaiBatalId,
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

  String? _wajib(String? v) => (v ?? '').trim().isEmpty ? 'Wajib diisi' : null;

  @override
  Widget build(BuildContext context) {
    final tahunIni = DateTime.now().year;
    return PopScope(
      canPop: !_kotor && !_kirim,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop || _kirim) return;
        if (await _bolehKeluar() && context.mounted) {
          _kotor = false;
          if (_prefix != null && !_edit) unawaited(_repo.lepasNomor(widget.sesi, _baId).catchError((Object _) {}));
          Navigator.pop(context);
        }
      },
      child: Scaffold(
        backgroundColor: const Color(0xFFF6F8FC),
        appBar: sisiAppBar(_edit ? 'Edit BA Pengoperasian' : 'BA Pengoperasian Trafo',
            subjudul: _edit ? '${_detail?['noGardu'] ?? 'Memuat'} · ${_detail?['idBa'] ?? ''}' : 'Gardu baru · nomor otomatis'),
        body: _edit && _detail == null
            ? (_galatDetail == null
                ? const SisiLoading(pesan: 'Memuat isian & foto BA...')
                : SisiKosong(ikon: Icons.cloud_off_rounded, judul: 'BA tidak termuat', pesan: _galatDetail, tombol: 'Coba lagi', onTombol: _muatDetail))
            : Form(
          key: _form,
          // v0.72.0: bukan ListView (lazy): kolom di luar layar dulu tidak ikut divalidasi (mis. Tahun PHB-TR 123 lolos ke
          // server = DI_LUAR_RENTANG). Column di SingleChildScrollView = semua kolom selalu hidup dan dicek.
          child: SingleChildScrollView(
            controller: _scroll,
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 120),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            KeyedSubtree(key: _kunci['identitas'], child: _kartuIdentitas()),
            const SizedBox(height: 12),
            KeyedSubtree(key: _kunci['trafo'], child: _kartuTrafo(tahunIni)),
            const SizedBox(height: 12),
            KeyedSubtree(key: _kunci['phb'], child: _kartuPhb(tahunIni)),
            const SizedBox(height: 12),
            KeyedSubtree(key: _kunci['operasi'], child: _kartuPengoperasian()),
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
                backgroundColor: AppColors.success700,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
            ),
            const SizedBox(height: 8),
            Text(
                _edit
                    ? 'Nomor Gardu, ID BA, No BA, dan Tanggal BA tetap. Dikirim di latar belakang, PDF dibuat ulang otomatis.'
                    : 'Dikirim di latar belakang: nomor BA dibuat server, lalu PDF otomatis. Form bisa langsung ditutup.',
                textAlign: TextAlign.center, style: TextStyle(fontSize: 11, color: AppColors.neutral500)),
          ]),
          ),
        ),
      ),
    );
  }

  Widget _kartuIdentitas() {
    final batal = (_nomor?['batal'] as List<dynamic>? ?? const <dynamic>[]).whereType<Map<dynamic, dynamic>>().toList();
    final tawarBatal = batal.isNotEmpty && _pakaiBatalId == null && !_lewatiBatal;
    final dipakai = _nomor?['asal'] == 'ULANG BATAL' ? [_nomor!] : const <Map<String, dynamic>>[];
    final nomorTampil = _noGarduTampil;
    return SectionCard(judul: 'Identitas Berita Acara', ikon: Icons.badge_outlined, children: [
      if (!_edit) ...[
      const Text('Kode Gardu (Prefix)', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: AppColors.neutral500)),
      const SizedBox(height: 6),
      SegmentedButton<String>(
        emptySelectionAllowed: true,
        showSelectedIcon: false,
        segments: const [
          ButtonSegment(value: 'TB', label: Text('TB')),
          ButtonSegment(value: 'PY', label: Text('PY')),
          ButtonSegment(value: 'TL', label: Text('TL')),
          ButtonSegment(value: 'PG', label: Text('PG')),
        ],
        selected: {if (_prefix != null) _prefix!},
        onSelectionChanged: _kirim
            ? null
            : (v) {
                if (v.isNotEmpty) unawaited(_pilihPrefix(v.first));
              },
      ),
      const SizedBox(height: 10),
      ],
      if (_muatNomor)
        const Padding(padding: EdgeInsets.symmetric(vertical: 6), child: Center(child: SisiLoader(ukuran: 28)))
      else if (_nomor != null)
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: AppColors.cyan100, borderRadius: BorderRadius.circular(12)),
          child: Row(children: [
            const Icon(Icons.tag_rounded, color: AppColors.navy700),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(nomorTampil, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: AppColors.navy900)),
                // v0.76.0 (permintaan kvlar): keterangan pesanan nomor dihapus; nomor BATAL tetap diberi tanda
                if (dipakai.isNotEmpty)
                  const Text('Nomor BATAL dipakai ulang', style: TextStyle(fontSize: 11, color: AppColors.neutral700)),
                if (_edit && '${_detail?['noBaFull'] ?? ''}'.isNotEmpty)
                  Text('${_detail!['noBaFull']}', style: const TextStyle(fontSize: 11, color: AppColors.neutral700)),
              ]),
            ),
            if (dipakai.isNotEmpty)
              TextButton(
                  onPressed: _muatNomor
                      ? null
                      : () {
                          _ubah(() => _lewatiBatal = true);
                          unawaited(_pesanNomor());
                        },
                  child: const Text('Batalkan')),
          ]),
        ),
      if (tawarBatal) ...[
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: AppColors.accent100, borderRadius: BorderRadius.circular(12)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Ada ${batal.length} nomor gardu BATAL yang belum dipakai ulang',
                style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: AppColors.accent700)),
            const SizedBox(height: 6),
            for (final b in batal)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: OutlinedButton(
                  onPressed: _muatNomor ? null : () => unawaited(_pesanNomor(batalId: '${b['garduId']}')),
                  child: Text('Pakai ${b['noGardu']}${'${b['alamat'] ?? ''}'.isEmpty ? '' : ' (${b['alamat']})'}'),
                ),
              ),
            TextButton(onPressed: () => _ubah(() => _lewatiBatal = true), child: const Text('Lewati, pakai nomor berikutnya')),
          ]),
        ),
      ],
      const SizedBox(height: 12),
      Row(children: [
        Expanded(child: _KolomTanggal(label: 'Tanggal BA', nilai: _tglBa, onTap: _edit ? null : () => _pilihTanggal(true))),
        const SizedBox(width: 10),
        Expanded(child: _KolomTanggal(label: 'Tanggal Pekerjaan', nilai: _tglKerja, onTap: () => _pilihTanggal(false))),
      ]),
    ]);
  }

  Widget _kartuTrafo(int tahunIni) {
    return SectionCard(judul: 'Identitas Trafo', ikon: Icons.bolt_rounded, children: [
      KolomPilih(
        key: ValueKey('kva-${_kvaOpsi.length}'),
        label: 'Kapasitas (kVA) *',
        judulSheet: 'Kapasitas trafo',
        keteranganSheet: 'Standar + kVA yang ada di Master Gardu.',
        pilihan: [for (final k in _kvaOpsi) PilihanItem('$k', '$k kVA'), const PilihanItem(_lainnya, 'Lainnya (ketik)')],
        nilaiAwal: _kvaPilih,
        validator: (v) => v == null ? 'Wajib dipilih' : null,
        onChanged: (v) => _ubah(() => _kvaPilih = v),
      ),
      if (_kvaPilih == _lainnya) ...[
        const SizedBox(height: 10),
        TextFormField(
          controller: _kva,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: sisiInput('Kapasitas lainnya (kVA) *'),
          validator: (v) => cekAngkaBa(v, min: 1, max: 5000),
          onChanged: (_) => _kotor = true,
        ),
      ],
      const SizedBox(height: 12),
      KolomPilih(
        label: 'Merk *',
        judulSheet: 'Merk trafo',
        pilihan: [for (final m in merkTrafoBa) PilihanItem(m, m), const PilihanItem(_lainnya, 'Lainnya (ketik)')],
        nilaiAwal: _merk,
        selaluCari: true,
        validator: (v) => v == null ? 'Wajib dipilih' : null,
        onChanged: (v) => _ubah(() => _merk = v),
      ),
      if (_merk == _lainnya) ...[
        const SizedBox(height: 10),
        TextFormField(controller: _merkLain, decoration: sisiInput('Merk lainnya *'), validator: _wajib, onChanged: (_) => _kotor = true),
      ],
      const SizedBox(height: 12),
      Row(children: [
        Expanded(
          flex: 3,
          child: TextFormField(controller: _seri, decoration: sisiInput('Nomor Seri *'), validator: _wajib, onChanged: (_) => _kotor = true),
        ),
        const SizedBox(width: 10),
        Expanded(
          flex: 2,
          child: TextFormField(
            controller: _tahun,
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
      KolomPilih(
        key: ValueKey('pny-${_penyulang.length}-$_pny'),
        label: 'Penyulang *',
        judulSheet: 'Pilih penyulang',
        pilihan: [for (final p in _penyulang) PilihanItem(p, p)],
        nilaiAwal: _pny,
        selaluCari: true,
        validator: (v) => v == null ? 'Wajib dipilih' : null,
        onChanged: (v) => unawaited(_pilihPenyulang(v)),
      ),
      if (_pny != null) ...[
        const SizedBox(height: 12),
        KolomPilih(
          key: ValueKey('sec-$_pny-${_section.length}-$_sectionId'),
          label: 'Section *',
          judulSheet: 'Pilih section ($_pny)',
          pilihan: [for (final s in _section) PilihanItem(s.id, s.nama)],
          nilaiAwal: _sectionId,
          selaluCari: true, // v0.72.0: tampilan sama dropdown section P0 Yandal (tanpa nomor)
          validator: (v) => v == null ? 'Wajib dipilih' : null,
          onChanged: (v) => unawaited(_pilihSection(v)),
        ),
      ],
      const SizedBox(height: 12),
      TextFormField(
        controller: _koordinat,
        keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
        decoration: sisiInput('Koordinat Trafo *',
            hint: '-3.012345, 106.512345',
            suffix: _gps
                ? const Padding(padding: EdgeInsets.all(12), child: SisiLoader(ukuran: 18))
                : IconButton(tooltip: 'Ambil GPS', icon: const Icon(Icons.my_location_rounded), onPressed: _ambilGps)),
        validator: (v) => Koordinat.cek(v, wajib: true),
        onChanged: (v) {
          _kotor = true;
          // diketik manual = bukan titik GPS lagi, chip akurasi hilang
          if (_akurasi != null && v.trim() != _koordinatGps) setState(() => _akurasi = null);
        },
      ),
      if (_akurasi != null) ...[
        const SizedBox(height: 6),
        Align(alignment: Alignment.centerLeft, child: _ChipAkurasi(_akurasi!)),
      ],
      const SizedBox(height: 12),
      TextFormField(
        controller: _jurusan,
        keyboardType: TextInputType.number,
        decoration: sisiInput('Jurusan Terpasang *'),
        validator: (v) => cekAngkaBa(v, min: 1, max: 12, bulat: true),
        onChanged: (_) => _kotor = true,
      ),
      const SizedBox(height: 12),
      TextFormField(
        controller: _alamat,
        maxLines: 2,
        decoration: sisiInput('Alamat *'),
        validator: _wajib,
        onChanged: (_) => _kotor = true,
      ),
    ]);
  }

  Widget _kartuPhb(int tahunIni) {
    return SectionCard(judul: 'Identitas PHB-TR', ikon: Icons.inventory_2_outlined, children: [
      TextFormField(controller: _merkPhb, decoration: sisiInput('Merk PHB-TR'), onChanged: (_) => _kotor = true),
      const SizedBox(height: 12),
      Row(children: [
        Expanded(
          flex: 3,
          child: TextFormField(controller: _seriPhb, decoration: sisiInput('Nomor Seri PHB-TR'), onChanged: (_) => _kotor = true),
        ),
        const SizedBox(width: 10),
        Expanded(
          flex: 2,
          child: TextFormField(
            controller: _tahunPhb,
            keyboardType: TextInputType.number,
            decoration: sisiInput('Tahun PHB-TR'),
            validator: (v) => cekAngkaBa(v, min: 1950, max: tahunIni + 1, wajib: false, bulat: true),
            onChanged: (_) => _kotor = true,
          ),
        ),
      ]),
    ]);
  }

  Widget _kartuPengoperasian() {
    final o = _owner;
    return SectionCard(judul: 'Data Pengoperasian', ikon: Icons.assignment_outlined, children: [
      const Text('Kepemilikan', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: AppColors.neutral500)),
      const SizedBox(height: 6),
      SegmentedButton<String>(
        showSelectedIcon: false,
        segments: const [ButtonSegment(value: 'PLN', label: Text('PLN')), ButtonSegment(value: 'Non-PLN', label: Text('Non-PLN'))],
        selected: {_kepemilikan},
        onSelectionChanged: (v) => _ubah(() => _kepemilikan = v.first),
      ),
      const SizedBox(height: 12),
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: AppColors.neutral50, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.neutral200)),
        child: _muatOwner
            ? const Padding(padding: EdgeInsets.symmetric(vertical: 6), child: Center(child: SisiLoader(ukuran: 28)))
            : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                _BarisHasil('OwnerId', o == null ? 'Otomatis setelah section dipilih' : ('${o['ownerId'] ?? ''}'.isEmpty ? '-' : '${o['ownerId']}')),
                _BarisHasil('External Ref', o == null ? '-' : ('${o['externalReference'] ?? ''}'.isEmpty ? '-' : '${o['externalReference']}')),
                if (o != null && o['ditemukan'] != true)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text('${o['pesan'] ?? ''}', style: const TextStyle(fontSize: 11, color: AppColors.accent700, fontWeight: FontWeight.w600)),
                  ),
              ]),
      ),
      const SizedBox(height: 12),
      TextFormField(
        controller: _perluasan,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        decoration: sisiInput('Panjang Perluasan SUTM',
            hint: 'Kosongkan / 0 kalau tidak ada. Desimal boleh koma: 2,7',
            suffix: const Padding(padding: EdgeInsets.all(14), child: Text('kmS'))),
        validator: (v) => cekAngkaBa(v, min: 0, max: 100, wajib: false),
        onChanged: (_) => _kotor = true,
      ),
      const SizedBox(height: 12),
      TextFormField(controller: _vendor, decoration: sisiInput('Vendor Pekerja'), onChanged: (_) => _kotor = true),
      const SizedBox(height: 12),
      TextFormField(controller: _catatan, maxLines: 2, decoration: sisiInput('Catatan'), onChanged: (_) => _kotor = true),
    ]);
  }

  Widget _kartuFoto() {
    return SectionCard(judul: 'Foto (${_foto.length}/${slotFotoPengoperasian.length})', ikon: Icons.photo_camera_outlined, children: [
      ClipRRect(
        borderRadius: BorderRadius.circular(6),
        child: LinearProgressIndicator(
          value: _foto.length / slotFotoPengoperasian.length,
          minHeight: 6,
          backgroundColor: AppColors.neutral100,
          color: _foto.length == slotFotoPengoperasian.length ? AppColors.success600 : AppColors.brand500,
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
          for (final s in slotFotoPengoperasian)
            _KotakFoto(
                label: s.$2,
                foto: _foto[s.$1],
                sibuk: _wmSlot == s.$1,
                onTap: _kirim || _wmSlot != null ? null : () => _ambilFoto(s.$1, s.$2)),
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
        decoration: BoxDecoration(color: AppColors.neutral50, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.neutral200)),
        child: tahu.length == 1
            ? _BarisHasil('Mengetahui', '${tahu.first['nama']} · ${tahu.first['jabatan']}')
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
  final VoidCallback? onTap; // null = terkunci (edit BA: Tanggal BA tetap)

  @override
  Widget build(BuildContext context) => InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: InputDecorator(
          decoration: sisiInput(label,
              suffix: Icon(onTap == null ? Icons.lock_outline_rounded : Icons.calendar_month_rounded, color: AppColors.neutral500)),
          child: Text(DateFormat('d MMM yyyy', 'id_ID').format(DateTime.parse(nilai)),
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.navy900)),
        ),
      );
}

class _KotakFoto extends StatelessWidget {
  const _KotakFoto({required this.label, required this.foto, required this.onTap, this.sibuk = false});
  final String label;
  final _Foto? foto;
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
                  child: Text('$label *',
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.navy900)),
                ),
                const Text('Ketuk untuk ambil', style: TextStyle(fontSize: 10.5, color: AppColors.neutral500)),
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
                top: 6,
                left: 6,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                  decoration: BoxDecoration(color: Colors.black54, borderRadius: BorderRadius.circular(999)),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(f.server ? Icons.cloud_done_rounded : (f.sumber == 'KAMERA' ? Icons.photo_camera_rounded : Icons.photo_library_rounded),
                        size: 11, color: Colors.white),
                    const SizedBox(width: 3),
                    Text(f.server ? 'Tersimpan' : (f.wm != null ? 'Kamera · WM' : 'Galeri'),
                        style: const TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, color: Colors.white)),
                  ]),
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
                child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  SisiLoader(ukuran: 26),
                  SizedBox(height: 8),
                  Text('Memasang watermark...', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.navy900)),
                ]),
              ),
          ]),
        ),
      ),
    );
  }
}

/// Chip akurasi koordinat dari tombol GPS (warna = bagus / sedang / lemah).
class _ChipAkurasi extends StatelessWidget {
  const _ChipAkurasi(this.meter);
  final double meter;

  @override
  Widget build(BuildContext context) {
    final a = akurasiBa(meter);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: a.latar, borderRadius: BorderRadius.circular(999)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.gps_fixed_rounded, size: 13, color: a.warna),
        const SizedBox(width: 5),
        Text(a.teks, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: a.warna)),
      ]),
    );
  }
}

class _BarisHasil extends StatelessWidget {
  const _BarisHasil(this.label, this.nilai);
  final String label;
  final String nilai;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 92, child: Text(label, style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500))),
          Expanded(child: Text(nilai, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.navy900))),
        ]),
      );
}
