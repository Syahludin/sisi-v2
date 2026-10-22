import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import '../../core/navigasi.dart';

import '../../core/api_client.dart';
import '../../core/gps.dart';
import '../../core/kode_error.dart';
import '../../theme/app_colors.dart';
import '../../widgets/accurate_gps_button.dart';
import '../../widgets/kolom_pilih.dart';
import '../row/row_model.dart';
import '../row/row_repository.dart' show RowError;
import 'foto_lapangan.dart';
import 'hartek_gaya.dart';
import '../../widgets/sisi_loader.dart';

/// Satu isian form Hartek (v0.89.0).
/// [grup] membuka kartu seksi baru. [baris] = isian berurutan dengan nilai baris sama tampil berdampingan
/// (mis. R / S / T). [segmen] = pilihan pendek tampil sebagai ubin berikon, bukan dropdown atau chip.
/// v1.0.15: [centang] = ubin segmen bertanda kotak centang (checklist), bukan ikon jenis PG. [pilihBanyak] = boleh
/// mencentang lebih dari satu; nilai = pilihan tercentang (urutan daftar) digabung ' & ' (mis. 'Tier 1 & Tier 2').
/// v1.0.16: keterangan dinamis di bawah isian (chip berwarna), mis. jenis pekerjaan ROW dari diameter.
typedef InfoIsianHartek = ({String teks, Color warna, Color latar, IconData ikon});

class IsianHartek {
  const IsianHartek(
    this.kunci,
    this.label, {
    this.wajib = false,
    this.angka = false,
    this.multi = false,
    this.koordinat = false,
    this.bulat = false,
    this.segmen = false,
    this.centang = false,
    this.pilihBanyak = false,
    this.bacaSaja = false,
    this.maks = 200,
    this.min = 0,
    this.max = 999999,
    this.grup,
    this.bantuan,
    this.contoh,
    this.akhiran,
    this.baris,
    this.pilihan,
    this.pilihanDari,
    this.isiLain,
    this.labelPilihan,
    this.turunan,
    this.ambilFoto,
    this.gpsSaja = false,
    this.infoDari,
  });
  final String kunci, label;
  final bool wajib, angka, multi, koordinat, bulat, segmen, centang, pilihBanyak, bacaSaja;

  /// v1.0.16: koordinat hanya dari tombol GPS perangkat (tidak bisa diketik), mis. WO Yandal = petugas di lapangan.
  final bool gpsSaja;

  /// v1.0.16: chip keterangan di bawah isian, dihitung dari isian form saat ini (null = tidak tampil).
  final InfoIsianHartek? Function(Map<String, String> nilai)? infoDari;
  final int maks;
  final num min, max;
  final String? grup, bantuan, contoh, akhiran, baris;
  final List<String>? pilihan;
  final List<String> Function(Map<String, String>)? pilihanDari;

  /// v0.91.0: isian lain yang ikut terisi saat nilai ini dipilih (mis. satuan dari master material / pekerjaan).
  /// Petugas tetap bisa mengubah hasilnya.
  final Map<String, String> Function(String nilai)? isiLain;

  /// v0.95.0: teks tampil tiap pilihan (mis. nomor gardu + alamat). Nilai yang disimpan tetap pilihan aslinya.
  final String Function(String nilai)? labelPilihan;

  /// v0.97.0: isian turunan yang dikosongkan setiap nilai ini berubah (mis. penyulang berubah = section, nomor
  /// gardu, dan titik gardu ikut kosong). Mencegah nilai lama ikut tersimpan di pilihan berjenjang.
  final List<String>? turunan;

  /// v1.0.0: isian FOTO (kotak kamera). Nilai = path file foto ber-watermark di HP. Dipanggil saat kotak diketuk
  /// dengan isian form saat ini + foto yang sudah ada; hasil null = batal. Galat = [RowError].
  final Future<String?> Function(BuildContext context, Map<String, String> nilai, String? pathAda)? ambilFoto;

  bool get foto => ambilFoto != null;

  List<String>? opsi(Map<String, String> nilai) => foto ? null : (pilihanDari?.call(nilai) ?? pilihan);

  String? cek(String? raw, Map<String, String> nilai) {
    final s = (raw ?? '').trim();
    if (foto) return s.isEmpty && wajib ? '$label wajib diambil' : null;
    if (s.isEmpty) return wajib ? '$label wajib diisi' : null;
    if (s.length > maks) return 'Maksimal $maks karakter';
    final p = opsi(nilai);
    if (p != null && (pilihBanyak ? !nilaiCentang(s).every(p.contains) : !p.contains(s))) return 'Pilih $label dari daftar';
    if (koordinat) return Koordinat.cek(s);
    if (angka) {
      final n = angkaDari(s);
      if (n == null) return 'Masukkan angka yang valid';
      if (n < min || n > max) return 'Isi antara $min dan $max';
      if (bulat && n != n.roundToDouble()) return 'Gunakan bilangan bulat';
    }
    if (multi && s.split('\n').length > 5) return 'Maksimal 5 baris';
    return null;
  }
}

/// v1.0.15: pilihan tercentang isian [IsianHartek.pilihBanyak] ('Tier 1 & Tier 2' -> ['Tier 1', 'Tier 2']).
List<String> nilaiCentang(String? v) => (v ?? '').split('&').map((x) => x.trim()).where((x) => x.isNotEmpty).toList();

/// v1.0.16: isian Laporan Utama (Hartek, Inspeksi Jaringan, Inspeksi Gardu) bergaya header ROW: titik koordinat
/// lapangan, KM berangkat + pulang berdampingan, kendala. Ringkas supaya cukup satu layar.
const List<IsianHartek> isianLaporanUtama = [
  IsianHartek('koordinatAwal', 'Koordinat awal pekerjaan', koordinat: true, grup: 'Titik koordinat lapangan', contoh: '-3.012345, 106.512345'),
  IsianHartek('koordinatAkhir', 'Koordinat akhir pekerjaan', koordinat: true, contoh: '-3.012345, 106.512345'),
  IsianHartek('kmAwal', 'KM berangkat', angka: true, max: 100000, akhiran: 'km', grup: 'Stand kendaraan (KM)', baris: 'km'),
  IsianHartek('kmAkhir', 'KM pulang', angka: true, max: 100000, akhiran: 'km', baris: 'km'),
  IsianHartek('kendala', 'Kendala & catatan (opsional)', multi: true, maks: 500, grup: 'Catatan'),
];

num? angkaDari(String? s) {
  final n = num.tryParse((s ?? '').trim().replaceAll(',', '.'));
  return n != null && n.isFinite ? n : null;
}

/// Form layar penuh. v0.95.0: simpan = tulis ke HP (cepat), dikirim ke server di latar. Galat tidak menghapus isian.
/// [ringkasan] = satu kalimat hasil hitung dari isian (mis. jarak tempuh), tampil di atas tombol simpan.
Future<Map<String, dynamic>?> bukaFormHartek(
  BuildContext context, {
  required String judul,
  required String keterangan,
  required List<IsianHartek> Function(Map<String, String>) daftar,
  required Future<Map<String, dynamic>?> Function(Map<String, String>) simpan,
  Map<String, String> awal = const {},
  String tombol = 'Simpan',
  Map<String, String> Function(Map<String, String>)? cekTambahan,
  String? Function(Map<String, String>)? ringkasan,
  String? fokus,
  String judulApp = 'Input Hartek',
  String catatanBawah = catatanFormOffline,
}) =>
    bukaForm<Map<String, dynamic>>(context, MaterialPageRoute(
      builder: (_) => FormHartekPage(
        judul: judul,
        keterangan: keterangan,
        daftar: daftar,
        simpan: simpan,
        awal: awal,
        tombol: tombol,
        cekTambahan: cekTambahan,
        ringkasan: ringkasan,
        fokus: fokus,
        judulApp: judulApp,
        catatanBawah: catatanBawah,
      ),
    ));

/// v1.0.2: teks di bawah form. Form petugas = tersimpan di HP; form admin online = langsung ke server.
const String catatanFormOffline = '* wajib diisi · tersimpan di HP, terkirim otomatis saat ada sinyal';
const String catatanFormOnline = '* wajib diisi · tersimpan langsung ke server (butuh sinyal)';

class FormHartekPage extends StatefulWidget {
  const FormHartekPage({
    super.key,
    required this.judul,
    required this.keterangan,
    required this.daftar,
    required this.simpan,
    this.awal = const {},
    this.tombol = 'Simpan',
    this.cekTambahan,
    this.ringkasan,
    this.fokus,
    this.judulApp = 'Input Hartek',
    this.catatanBawah = catatanFormOffline,
  });
  final String judul, keterangan, tombol;

  /// v1.0.0: judul AppBar (form Inspeksi Jaringan memakai form yang sama).
  final String judulApp;

  /// v1.0.2: teks keterangan di bawah isian (lihat [catatanFormOffline] / [catatanFormOnline]).
  final String catatanBawah;

  /// v0.97.0: kunci isian yang langsung disorot & difokuskan saat form terbuka (ketukan dari kartu laporan).
  final String? fokus;
  final List<IsianHartek> Function(Map<String, String>) daftar;
  final Future<Map<String, dynamic>?> Function(Map<String, String>) simpan;
  final Map<String, String> awal;
  final Map<String, String> Function(Map<String, String>)? cekTambahan;
  final String? Function(Map<String, String>)? ringkasan;

  @override
  State<FormHartekPage> createState() => _FormHartekPageState();
}

class _FormHartekPageState extends State<FormHartekPage> {
  late final Map<String, String> _nilai = {...widget.awal};
  final _controllers = <String, TextEditingController>{};
  final _focus = <String, FocusNode>{};
  final _anchors = <String, GlobalKey>{};
  final _scroll = ScrollController();
  Map<String, String> _errors = {};
  String? _pesan, _gpsKey;
  String? _fotoKey; // v1.0.0: kotak foto yang sedang diproses
  PengambilanGps? _gps;
  bool _sibuk = false, _kotor = false, _bolehKeluar = false;
  bool _perluSegarkan = false, _dialogKeluar = false;
  String? _infoGps, _infoGpsKunci;
  final _akurasi = <String, double>{};
  final _koordinatGps = <String, String>{};
  double? _akurasiLive;
  int _detikGps = 0;

  @override
  void initState() {
    super.initState();
    Gps.mulaiHangat();
    for (final e in widget.awal.entries) {
      if (e.key.startsWith('_akurasi_')) {
        final k = e.key.substring('_akurasi_'.length);
        final a = double.tryParse(e.value.trim());
        final v = (widget.awal[k] ?? '').trim();
        if (a != null && a > 0 && v.isNotEmpty) {
          _akurasi[k] = a;
          _koordinatGps[k] = v;
        }
      }
    }
    final k = widget.fokus;
    if (k != null && k.isNotEmpty) _tunjuk(k);
  }

  @override
  void dispose() {
    _gps?.hentikan();
    Gps.hentiHangat();
    for (final c in _controllers.values) {
      c.dispose();
    }
    for (final f in _focus.values) {
      f.dispose();
    }
    _scroll.dispose();
    super.dispose();
  }

  TextEditingController _controller(String k) =>
      _controllers.putIfAbsent(k, () => TextEditingController(text: _nilai[k] ?? ''));
  FocusNode _node(String k) => _focus.putIfAbsent(k, () => FocusNode());

  void _ubah(String k, String v, {double? akurasiM}) {
    setState(() {
      _nilai[k] = v;
      if (akurasiM != null) {
        _akurasi[k] = akurasiM;
        _koordinatGps[k] = v.trim();
        _nilai['_akurasi_$k'] = akurasiM.toString();
      } else if (_koordinatGps[k] != v.trim()) {
        _akurasi.remove(k);
        _koordinatGps.remove(k);
        _nilai.remove('_akurasi_$k');
      }
      _kotor = true;
      _errors.remove(k);
      final sumber = widget.daftar(_nilai).where((x) => x.kunci == k);
      final def = sumber.isEmpty ? null : sumber.first;
      // v0.97.0: pilihan berjenjang: isian turunan dikosongkan dulu, lalu diisi ulang oleh isiLain bila ada
      for (final t in def?.turunan ?? const <String>[]) {
        _nilai.remove(t);
        _nilai.remove('_akurasi_$t');
        _akurasi.remove(t);
        _koordinatGps.remove(t);
        _controllers[t]?.clear();
        _errors.remove(t);
      }
      final lain = def?.isiLain?.call(v);
      if (lain != null) {
        for (final e in lain.entries) {
          if (e.value.isEmpty) {
            _nilai.remove(e.key);
            _controllers[e.key]?.clear();
          } else {
            _nilai[e.key] = e.value;
            _controllers[e.key]?.text = e.value;
          }
          _errors.remove(e.key);
        }
      }
      // Jenis / penyulang berubah: kosongkan isian yang tidak tampil lagi dan section lama.
      final terlihat = widget.daftar(_nilai);
      final keys = terlihat.map((i) => i.kunci).toSet();
      for (final key in _nilai.keys.toList()) {
        if (key.startsWith('_akurasi_')) {
          final target = key.substring('_akurasi_'.length);
          if (!keys.contains(target)) {
            _nilai.remove(key);
            _akurasi.remove(target);
            _koordinatGps.remove(target);
          }
          continue;
        }
        final i = terlihat.where((x) => x.kunci == key);
        final options = i.isEmpty ? null : i.first.opsi(_nilai);
        // v1.0.15: nilai pilihBanyak ('Tier 1 & Tier 2') dicek per pilihan
        final sah = options == null ||
            (i.first.pilihBanyak ? nilaiCentang(_nilai[key]).every(options.contains) : options.contains(_nilai[key]));
        if (!keys.contains(key) || !sah) {
          _nilai.remove(key);
          _nilai.remove('_akurasi_$key');
          _akurasi.remove(key);
          _koordinatGps.remove(key);
          _controllers[key]?.clear();
          _errors.remove(key);
        }
      }
    });
  }

  void _tunjuk(String k) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final ctx = _anchors[k]?.currentContext;
      if (ctx != null) {
        Scrollable.ensureVisible(ctx, duration: const Duration(milliseconds: 220), alignment: .15);
        _node(k).requestFocus();
      }
    });
  }

  Future<void> _kembali() async {
    if (_sibuk || _gpsKey != null || _fotoKey != null || _dialogKeluar) return;
    if (_kotor && !_perluSegarkan) {
      _dialogKeluar = true;
      final keluar = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: const Text('Tinggalkan isian?'),
          content: const Text('Perubahan di halaman ini belum disimpan.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Lanjut isi')),
            FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Tinggalkan')),
          ],
        ),
      );
      _dialogKeluar = false;
      if (keluar != true || !mounted) return;
    }
    _buangFotoBaru();
    _tutup(null);
  }

  /// v1.0.0: form ditinggalkan = file foto yang baru diambil di form ini dihapus dari HP.
  void _buangFotoBaru() {
    final lama = widget.awal.values.toSet();
    for (final i in widget.daftar(_nilai)) {
      final v = _nilai[i.kunci];
      if (i.foto && v != null && v.isNotEmpty && !lama.contains(v)) unawaited(FotoLapangan.hapus(v));
    }
  }

  Future<void> _ambilFoto(IsianHartek i) async {
    final f = i.ambilFoto;
    if (f == null || _fotoKey != null || _sibuk || _gpsKey != null) return;
    FocusScope.of(context).unfocus();
    setState(() => _fotoKey = i.kunci);
    try {
      final lama = _nilai[i.kunci];
      final path = await f(context, Map<String, String>.from(_nilai), lama == null || lama.isEmpty ? null : lama);
      if (!mounted || path == null || path.isEmpty) return;
      _ubah(i.kunci, path);
      if (lama != null && lama.isNotEmpty && lama != path && !widget.awal.values.contains(lama)) {
        unawaited(FotoLapangan.hapus(lama));
      }
    } on RowError catch (e) {
      if (mounted) setState(() => _errors = {..._errors, i.kunci: e.pesan});
    } catch (_) {
      if (mounted) setState(() => _errors = {..._errors, i.kunci: 'Foto gagal diambil. Coba lagi.'});
    } finally {
      if (mounted) setState(() => _fotoKey = null);
    }
  }

  Widget _kotakFoto(IsianHartek i) {
    final path = (_nilai[i.kunci] ?? '').trim();
    final ada = path.isNotEmpty && File(path).existsSync();
    final proses = _fotoKey == i.kunci;
    final beku = _sibuk || _gpsKey != null || _fotoKey != null;
    final err = _errors[i.kunci];
    final bentuk = BorderRadius.circular(14);
    Widget isi;
    if (proses) {
      isi = const Center(child: SisiLoader(ukuran: 26));
    } else if (ada) {
      isi = Stack(fit: StackFit.expand, children: [
        Image.file(File(path), fit: BoxFit.cover, cacheWidth: 640, gaplessPlayback: true),
        Positioned(
          right: 8,
          bottom: 8,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(color: Colors.black.withValues(alpha: .6), borderRadius: BorderRadius.circular(8)),
            child: const Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(Icons.cameraswitch_rounded, size: 14, color: Colors.white),
              SizedBox(width: 4),
              Text('Ambil ulang', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.white)),
            ]),
          ),
        ),
      ]);
    } else {
      isi = Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        Icon(Icons.photo_camera_rounded, size: 30, color: err != null ? AppColors.red600 : HartekGaya.merek),
        const SizedBox(height: 6),
        Text('Ambil foto',
            style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: err != null ? AppColors.red700 : HartekGaya.merek)),
        const SizedBox(height: 2),
        const Text('Kamera SiSi', style: TextStyle(fontSize: 12, color: HartekGaya.redup)),
      ]);
    }
    return Focus(
      key: ValueKey('input-${i.kunci}'),
      focusNode: _node(i.kunci),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Semantics(
          button: true,
          label: ada ? '${i.label}, sudah diambil. Ketuk untuk ambil ulang' : 'Ambil ${i.label.toLowerCase()}',
          child: Material(
            color: ada ? Colors.black : AppColors.neutral50,
            clipBehavior: Clip.antiAlias,
            shape: RoundedRectangleBorder(
              borderRadius: bentuk,
              side: BorderSide(color: err != null ? AppColors.red600 : HartekGaya.garis, width: err != null ? 1.4 : 1),
            ),
            child: InkWell(
              key: ValueKey('foto-${i.kunci}'),
              onTap: beku ? null : () => unawaited(_ambilFoto(i)),
              child: AspectRatio(aspectRatio: 4 / 3, child: isi),
            ),
          ),
        ),
        if (err != null)
          Padding(
            padding: const EdgeInsets.only(top: 8, left: 4),
            child: Text(err, style: const TextStyle(fontSize: 13, color: AppColors.red700)),
          ),
      ]),
    );
  }

  void _tutup(Map<String, dynamic>? hasil) {
    setState(() => _bolehKeluar = true);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) Navigator.pop(context, hasil);
    });
  }

  Future<void> _simpan() async {
    if (_sibuk || _gpsKey != null || _perluSegarkan || _bolehKeluar) return;
    final errors = <String, String>{};
    for (final i in widget.daftar(_nilai)) {
      final e = i.cek(_nilai[i.kunci], _nilai);
      if (e != null) errors[i.kunci] = e;
    }
    errors.addAll(widget.cekTambahan?.call(_nilai) ?? {});
    setState(() {
      _errors = errors;
      _pesan = null;
    });
    if (errors.isNotEmpty) {
      _tunjuk(errors.keys.first);
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() => _sibuk = true);
    try {
      final hasil = await widget.simpan(Map<String, String>.from(_nilai));
      if (!mounted) return;
      _tutup(hasil);
    } on ApiException catch (e) {
      if (!mounted) return;
      final pesan = pesanHartek(e.kode);
      final k = e.kolom ??
          const {
            'KM_AKHIR_KURANG': 'kmAkhir',
            'GARDU_TIDAK_ADA': 'noGardu',
            'GARDU_GANDA': 'noGardu',
            'SECTION_TIDAK_VALID': 'section',
            'PENYULANG_TIDAK_VALID': 'penyulang',
            'MATERIAL_TIDAK_VALID': 'material',
            'KEPEMILIKAN_TIDAK_VALID': 'kepemilikan',
            'JENIS_PERALATAN_TIDAK_VALID': 'jenisPeralatan',
            'PEKERJAAN_TIDAK_DIKENAL': 'pekerjaan',
            'PEKERJAAN_BEDA_JENIS': 'pekerjaan',
            'JENIS_TEMUAN_TIDAK_VALID': 'jenisTemuan', // v1.0.0: form Inspeksi Jaringan
            'REALISASI_GANDA': 'tier',
          }[e.kode];
      final refresh = const {
        'LAPORAN_UTAMA_SUDAH_DIBUAT',
        'KONFLIK_REVISION',
        'TANGGAL_DI_LUAR_BATAS',
        'DATA_TIDAK_DITEMUKAN',
      }.contains(e.kode);
      final tidakPasti = e.kode.startsWith('HTTP_') ||
          const {'RESPON_BUKAN_JSON', 'RESPON_TIDAK_VALID', 'ENV_TIDAK_COCOK'}.contains(e.kode);
      setState(() {
        _pesan = tidakPasti ? _statusBelumPasti : pesan;
        _perluSegarkan = refresh || tidakPasti;
        if (k != null && widget.daftar(_nilai).any((i) => i.kunci == k)) _errors[k] = pesan;
      });
      if (k != null && _errors.containsKey(k)) {
        _tunjuk(k);
      } else {
        await _scroll.animateTo(0, duration: const Duration(milliseconds: 200), curve: Curves.easeOut);
      }
    } catch (_) {
      if (!mounted) return;
      // Timeout bisa terjadi setelah server menyimpan. Jangan kirim ulang otomatis.
      setState(() {
        _pesan = _statusBelumPasti;
        _perluSegarkan = true;
      });
      await _scroll.animateTo(0, duration: const Duration(milliseconds: 200), curve: Curves.easeOut);
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  static const _statusBelumPasti =
      'Status simpan belum diketahui. Kembali dan segarkan laporan untuk memeriksa hasilnya sebelum mengirim ulang.';

  Future<void> _ambilGps(IsianHartek i) async {
    if (_gpsKey != null || _sibuk) return;
    setState(() {
      _gpsKey = i.kunci;
      _akurasiLive = null;
      _detikGps = 0;
      _infoGpsKunci = i.kunci;
      _infoGps = null;
    });
    try {
      final galat = await Gps.siapkan();
      if (!mounted) return;
      if (galat != null) {
        setState(() => _infoGps = galat);
        return;
      }
      final jalan = PengambilanGps(onProgres: (t, d) {
        if (mounted) {
          setState(() {
            _akurasiLive = t?.akurasi;
            _detikGps = d;
          });
        }
      });
      _gps = jalan;
      final h = await jalan.jalankan();
      if (!mounted) return;
      if (h.palsu) {
        setState(() => _infoGps = 'Lokasi palsu terdeteksi. Matikan aplikasi lokasi palsu.');
        return;
      }
      final titik = h.titik;
      if (titik == null) {
        setState(() => _infoGps = h.galat ?? 'Titik belum didapat. Coba lagi.');
        return;
      }
      final v = Koordinat.format(titik.lat, titik.lng);
      _controller(i.kunci).text = v;
      _ubah(i.kunci, v, akurasiM: titik.akurasi);
      setState(() => _infoGps = null);
    } catch (_) {
      if (mounted) setState(() => _infoGps = 'GPS belum bisa digunakan. Periksa izin lokasi.');
    } finally {
      _gps = null;
      if (mounted) {
        setState(() {
          _gpsKey = null;
          _akurasiLive = null;
        });
      }
    }
  }

  // ---------- tampilan isian ----------

  InputDecoration _dekor(IsianHartek i, {Widget? suffix, String? hint}) {
    OutlineInputBorder b(Color c, [double w = 1]) =>
        OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: c, width: w));
    return InputDecoration(
      filled: true,
      fillColor: i.bacaSaja ? AppColors.neutral100 : AppColors.neutral50,
      border: b(HartekGaya.garis),
      enabledBorder: b(HartekGaya.garis),
      focusedBorder: b(i.bacaSaja ? HartekGaya.garis : HartekGaya.merek, i.bacaSaja ? 1 : 1.6),
      errorBorder: b(AppColors.red600),
      focusedErrorBorder: b(AppColors.red600, 1.6),
      errorText: _errors[i.kunci],
      errorMaxLines: 3,
      hintText: hint ?? i.contoh,
      hintStyle: const TextStyle(fontSize: 15, color: AppColors.neutral500),
      suffixText: i.akhiran,
      suffixStyle: HartekGaya.sekunder,
      suffixIcon: suffix,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 15),
    );
  }

  Widget _tombolGps(IsianHartek i) {
    final jalan = _gpsKey == i.kunci;
    return Padding(
      padding: const EdgeInsets.all(6),
      child: SizedBox(
        width: 44,
        height: 44,
        child: Material(
          color: HartekGaya.merek,
          borderRadius: BorderRadius.circular(11),
          child: InkWell(
            borderRadius: BorderRadius.circular(11),
            onTap: _sibuk
                ? null
                : jalan
                    ? () => _gps?.hentikan()
                    : _gpsKey != null
                        ? null
                        : () => _ambilGps(i),
            child: Tooltip(
              message: jalan ? 'Pakai titik terbaik sekarang' : 'Ambil koordinat GPS',
              child: Center(
                child: jalan
                    ? const SisiLoader(ukuran: 18, warna: Colors.white)
                    : const Icon(Icons.my_location_rounded, size: 20, color: Colors.white),
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// v1.0.15: centang / lepas satu pilihan isian pilihBanyak; nilai baru mengikuti urutan daftar.
  String _togelCentang(IsianHartek i, String o) {
    final ada = nilaiCentang(_nilai[i.kunci]).toSet();
    if (!ada.remove(o)) ada.add(o);
    return [for (final x in i.opsi(_nilai) ?? const <String>[]) if (ada.contains(x)) x].join(' & ');
  }

  Widget _ubinSegmen(IsianHartek i, String o, bool pilih, bool beku) {
    final centang = i.centang || i.pilihBanyak;
    final ikon = centang ? (pilih ? Icons.check_box_rounded : Icons.check_box_outline_blank_rounded) : JenisPg.dari(o).ikon;
    final bentuk = BorderRadius.circular(16);
    return Semantics(
      button: true,
      selected: pilih,
      checked: centang ? pilih : null,
      label: o,
      child: Material(
        color: pilih ? AppColors.brand50 : AppColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: bentuk,
          side: BorderSide(color: pilih ? HartekGaya.merek : HartekGaya.garis, width: pilih ? 1.6 : 1),
        ),
        child: InkWell(
          key: ValueKey('pilih-${i.kunci}-$o'),
          borderRadius: bentuk,
          onTap: beku ? null : () => _ubah(i.kunci, i.pilihBanyak ? _togelCentang(i, o) : o),
          child: Padding(
            padding: centang ? const EdgeInsets.fromLTRB(6, 12, 6, 10) : const EdgeInsets.fromLTRB(6, 16, 6, 14),
            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(ikon, size: centang ? 24 : 26, color: pilih ? HartekGaya.merek : HartekGaya.redup),
              SizedBox(height: centang ? 6 : 10),
              Text(
                o,
                textAlign: TextAlign.center,
                maxLines: 2,
                style: TextStyle(
                  fontSize: 14,
                  height: 1.25,
                  fontWeight: pilih ? FontWeight.w700 : FontWeight.w600,
                  color: pilih ? HartekGaya.tinta : AppColors.neutral700,
                ),
              ),
            ]),
          ),
        ),
      ),
    );
  }

  Widget _kontrol(IsianHartek i) {
    if (i.foto) return _kotakFoto(i);
    final options = i.opsi(_nilai);
    final value = _nilai[i.kunci] ?? '';
    final beku = _sibuk || _gpsKey != null || _fotoKey != null;
    if (i.segmen && options != null) {
      return Focus(
        key: ValueKey('input-${i.kunci}'),
        focusNode: _node(i.kunci),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          IntrinsicHeight(
            child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              for (var n = 0; n < options.length; n++) ...[
                if (n > 0) const SizedBox(width: 10),
                Expanded(
                    child: _ubinSegmen(i, options[n], i.pilihBanyak ? nilaiCentang(value).contains(options[n]) : value == options[n], beku)),
              ],
            ]),
          ),
          if (_errors[i.kunci] != null)
            Padding(
              padding: const EdgeInsets.only(top: 8, left: 4),
              child: Text(_errors[i.kunci]!, style: const TextStyle(fontSize: 13, color: AppColors.red700)),
            ),
        ]),
      );
    }
    if (options != null) {
      return Semantics(
        button: true,
        label: i.label,
        child: InkWell(
          key: ValueKey('input-${i.kunci}'),
          focusNode: _node(i.kunci),
          borderRadius: BorderRadius.circular(14),
          onTap: beku || options.isEmpty
              ? null
              : () async {
                  final v = await bukaPilihan(
                    context,
                    judul: 'Pilih ${i.label.toLowerCase()}',
                    pilihan: options.toSet().map((s) => PilihanItem(s, i.labelPilihan?.call(s) ?? s)).toList(),
                    terpilih: value,
                    selaluCari: options.length > 8,
                  );
                  if (mounted && v != null) _ubah(i.kunci, v);
                },
          child: InputDecorator(
            decoration: _dekor(i, suffix: const Icon(Icons.expand_more_rounded, color: HartekGaya.redup)),
            child: Text(
              value.isEmpty ? 'Pilih ${i.label.toLowerCase()}' : (i.labelPilihan?.call(value) ?? value),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 15.5,
                fontWeight: value.isEmpty ? FontWeight.w400 : FontWeight.w600,
                color: value.isEmpty ? AppColors.neutral500 : HartekGaya.tinta,
              ),
            ),
          ),
        ),
      );
    }
    if (i.bacaSaja) {
      return Semantics(
        label: i.label,
        readOnly: true,
        child: InputDecorator(
          key: ValueKey('input-${i.kunci}'),
          decoration: _dekor(i),
          child: Text(
            value.isEmpty ? (i.contoh ?? '–') : value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 15.5,
              fontWeight: value.isEmpty ? FontWeight.w500 : FontWeight.w700,
              color: value.isEmpty ? AppColors.neutral500 : HartekGaya.tinta,
            ),
          ),
        ),
      );
    }
    return Semantics(
      label: i.label,
      child: TextField(
        key: ValueKey('input-${i.kunci}'),
        controller: _controller(i.kunci),
        focusNode: _node(i.kunci),
        readOnly: beku || i.gpsSaja,
        style: TextStyle(fontSize: 15.5, color: HartekGaya.tinta, fontFeatures: i.angka ? HartekGaya.tabular : null),
        keyboardType: i.angka
            ? const TextInputType.numberWithOptions(decimal: true)
            : i.multi
                ? TextInputType.multiline
                : TextInputType.text,
        textInputAction: i.multi ? TextInputAction.newline : TextInputAction.next,
        minLines: i.multi ? 3 : 1,
        maxLines: i.multi ? 5 : 1,
        decoration: _dekor(i, suffix: i.koordinat ? _tombolGps(i) : null, hint: i.gpsSaja ? 'Ketuk tombol GPS' : null),
        onChanged: (v) => _ubah(i.kunci, v),
        onSubmitted: (_) => FocusScope.of(context).nextFocus(),
      ),
    );
  }

  Widget _field(IsianHartek i) {
    final options = i.opsi(_nilai);
    final infoGps = _infoGps != null && _infoGpsKunci == i.kunci;
    final jalanGps = _gpsKey == i.kunci;
    return Padding(
      key: _anchors.putIfAbsent(i.kunci, () => GlobalKey()),
      padding: const EdgeInsets.only(bottom: 18),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text.rich(
            TextSpan(text: i.label, children: [
              if (i.wajib) const TextSpan(text: ' *', style: TextStyle(color: AppColors.red600)),
            ]),
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: HartekGaya.tinta),
          ),
        ),
        _kontrol(i),
        if (i.infoDari?.call(_nilai) case final info?) _chipInfo(info),
        if (i.koordinat && !i.bacaSaja)
          ChipAkurasi(
            akurasiM: jalanGps ? _akurasiLive : _akurasi[i.kunci],
            terisi: !jalanGps && (_nilai[i.kunci] ?? '').trim().isNotEmpty,
            berjalan: jalanGps,
            detik: _detikGps,
          ),
        if (infoGps)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Semantics(
              liveRegion: true,
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Padding(
                  padding: EdgeInsets.only(top: 2),
                  child: Icon(Icons.error_outline_rounded, size: 15, color: AppColors.red700),
                ),
                const SizedBox(width: 6),
                Expanded(child: Text(_infoGps!, style: const TextStyle(fontSize: 13, color: AppColors.red700))),
              ]),
            ),
          ),
        if (i.bantuan != null || options?.isEmpty == true)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              options?.isEmpty == true ? (i.bantuan ?? 'Belum ada pilihan aktif.') : i.bantuan!,
              style: const TextStyle(fontSize: 13.5, height: 1.4, color: HartekGaya.redup),
            ),
          ),
      ]),
    );
  }

  /// v1.0.16: chip keterangan dinamis [IsianHartek.infoDari].
  Widget _chipInfo(InfoIsianHartek info) => Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Align(
          alignment: Alignment.centerLeft,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            decoration: BoxDecoration(color: info.latar, borderRadius: BorderRadius.circular(999), border: Border.all(color: info.warna.withValues(alpha: .35))),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(info.ikon, size: 16, color: info.warna),
              const SizedBox(width: 6),
              Flexible(child: Text(info.teks, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: info.warna))),
            ]),
          ),
        ),
      );

  Widget _kartuSeksi(String? judul, List<Widget> isi) => Container(
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 2),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(HartekGaya.radius),
          border: Border.all(color: HartekGaya.garis),
          boxShadow: [BoxShadow(color: AppColors.brand950.withValues(alpha: .04), blurRadius: 12, offset: const Offset(0, 4))],
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (judul != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: Row(children: [
                Container(
                  width: 4,
                  height: 18,
                  decoration: BoxDecoration(color: HartekGaya.merek, borderRadius: BorderRadius.circular(4)),
                ),
                const SizedBox(width: 8),
                Expanded(child: Text(judul, style: HartekGaya.judulSeksi)),
              ]),
            ),
          ...isi,
        ]),
      );

  /// Kelompokkan isian per [IsianHartek.grup] jadi kartu; isian dengan [IsianHartek.baris] sama jadi satu baris.
  List<Widget> _seksi(List<IsianHartek> fields) {
    final hasil = <Widget>[];
    String? judul;
    var isi = <Widget>[];
    void tutup() {
      if (isi.isEmpty) return;
      hasil.add(_kartuSeksi(judul, isi));
      isi = <Widget>[];
    }

    var i = 0;
    while (i < fields.length) {
      final f = fields[i];
      if (f.grup != null && f.grup != judul) {
        tutup();
        judul = f.grup;
      }
      if (f.baris != null) {
        final sebaris = <IsianHartek>[];
        while (i < fields.length &&
            fields[i].baris == f.baris &&
            (fields[i].grup == null || fields[i].grup == judul)) {
          sebaris.add(fields[i]);
          i++;
        }
        isi.add(Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          for (var n = 0; n < sebaris.length; n++) ...[
            if (n > 0) const SizedBox(width: 12),
            Expanded(child: _field(sebaris[n])),
          ],
        ]));
        continue;
      }
      isi.add(_field(f));
      i++;
    }
    tutup();
    return hasil;
  }

  @override
  Widget build(BuildContext context) {
    final fields = widget.daftar(_nilai);
    final ringkas = widget.ringkasan?.call(_nilai);
    return PopScope(
      canPop: _bolehKeluar,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _kembali();
      },
      child: Scaffold(
        backgroundColor: HartekGaya.latar,
        appBar: AppBar(
          backgroundColor: HartekGaya.latar,
          surfaceTintColor: Colors.transparent,
          scrolledUnderElevation: 0,
          titleSpacing: 0,
          title: Text(widget.judulApp, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: HartekGaya.tinta)),
          leading: IconButton(
            tooltip: 'Kembali',
            onPressed: _sibuk || _gpsKey != null || _fotoKey != null ? null : _kembali,
            icon: const Icon(Icons.arrow_back_rounded, color: HartekGaya.tinta),
          ),
        ),
        body: SingleChildScrollView(
          controller: _scroll,
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 600),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [AppColors.brand50, AppColors.surface],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(HartekGaya.radius),
                    border: Border.all(color: AppColors.brand100),
                  ),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(widget.judul, style: HartekGaya.judulBesar),
                    const SizedBox(height: 6),
                    Text(widget.keterangan, style: HartekGaya.sekunder.copyWith(fontSize: 14.5)),
                  ]),
                ),
                const SizedBox(height: 18),
                if (_pesan != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: Semantics(
                      liveRegion: true,
                      child: Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(color: AppColors.red100, borderRadius: BorderRadius.circular(14)),
                        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          const Icon(Icons.error_outline_rounded, size: 20, color: AppColors.red700),
                          const SizedBox(width: 10),
                          Expanded(child: Text(_pesan!, style: const TextStyle(fontSize: 14.5, height: 1.4, color: AppColors.red700))),
                        ]),
                      ),
                    ),
                  ),
                ..._seksi(fields),
                if (ringkas != null)
                  Container(
                    margin: const EdgeInsets.only(bottom: 14),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: AppColors.brand50,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: AppColors.brand100),
                    ),
                    child: Row(children: [
                      const Icon(Icons.insights, size: 20, color: HartekGaya.merek),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(ringkas,
                            style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: AppColors.brand900)),
                      ),
                    ]),
                  ),
                Text(widget.catatanBawah, style: const TextStyle(fontSize: 13, color: HartekGaya.redup)),
              ]),
            ),
          ),
        ),
        bottomNavigationBar: Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
          child: DecoratedBox(
            decoration: const BoxDecoration(
              color: AppColors.surface,
              border: Border(top: BorderSide(color: HartekGaya.garis)),
            ),
            child: SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
                child: FilledButton(
                  key: const ValueKey('simpan-hartek'),
                  onPressed: _sibuk || _gpsKey != null || _fotoKey != null || _bolehKeluar
                      ? null
                      : _perluSegarkan
                          ? _kembali
                          : _simpan,
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(54),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                  ),
                  child: _sibuk
                      ? const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                          SisiLoader(ukuran: 18, warna: AppColors.surface),
                          SizedBox(width: 12),
                          Flexible(child: Text('Menyimpan…')),
                        ])
                      : Text(_perluSegarkan ? 'Kembali & segarkan laporan' : widget.tombol),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

String pesanHartek(String kode) {
  switch (kode) {
    case 'LAPORAN_UTAMA_SUDAH_DIBUAT':
      return 'Laporan Utama telah dibuat. Buka laporan yang sudah ada.';
    case 'KONFLIK_REVISION':
      return 'Data telah diubah perangkat lain. Segarkan laporan sebelum mengubahnya.';
    case 'KM_AKHIR_KURANG':
      return 'KM akhir tidak boleh lebih kecil dari KM awal.';
    case 'GARDU_TIDAK_ADA':
      return 'Nomor gardu tidak ditemukan. Periksa nomor sesuai master gardu.';
    case 'GARDU_GANDA':
      return 'Gardu ini sudah dipakai untuk jenis pekerjaan yang sama.';
    case 'SECTION_TIDAK_VALID':
      return 'Pilih section yang sesuai dengan penyulang.';
    case 'PENYULANG_TIDAK_VALID':
      return 'Pilih penyulang yang aktif dari daftar.';
    case 'MATERIAL_TIDAK_VALID':
      return 'Material tidak aktif atau tidak ditemukan di SiSi_Master.';
    case 'KEPEMILIKAN_TIDAK_VALID':
      return 'Kepemilikan tidak aktif atau tidak ditemukan di db_Kepemilikan_Material.';
    case 'JENIS_PERALATAN_TIDAK_VALID':
      return 'Jenis peralatan tidak aktif atau tidak ditemukan di db_jenis_peralatan.';
    case 'TANGGAL_DI_LUAR_BATAS':
      return 'Hari laporan sudah berganti. Buka laporan hari ini.';
    case 'MASIH_ADA_ANAK':
      return 'PG tidak bisa diubah karena sudah memiliki pekerjaan.';
    case 'PEKERJAAN_TIDAK_DIKENAL':
      return 'Pekerjaan tidak aktif atau tidak ada di daftar Hartek. Pilih dari daftar.';
    case 'PEKERJAAN_BEDA_JENIS':
      return 'Pekerjaan ini untuk jenis lokasi lain. Pilih dari daftar lokasi ini.';
    case 'PEKERJAAN_TIDAK_SESUAI':
      return 'Rincian ini tidak sesuai pekerjaannya: pemerataan hanya untuk Pemerataan / Pembagian Beban Gardu, '
          'grounding hanya untuk pekerjaan Grounding.';
    case 'REALISASI_GANDA':
      return 'Penyulang dengan tier ini sudah ada di laporan hari ini.';
    case 'JENIS_TEMUAN_TIDAK_VALID':
      return 'Jenis temuan tidak aktif atau tidak ada di db_Jenis_Temuan. Pilih dari daftar.';
    case 'FOTO_SUDAH_ADA':
      return 'Foto ini sudah ada.';
    default:
      return KodeError.pesan(kode);
  }
}
