import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import 'ba_bantu.dart';
import 'ba_repository.dart';

/// v0.76.0 (permintaan kvlar 10 Okt 2026): simpan BA berjalan di LATAR BELAKANG. Form langsung tertutup sesudah Simpan;
/// kirim foto > simpan / ubah BA > buat PDF dikerjakan antrean ini selama aplikasi terbuka (layar lain tetap bisa dipakai).
/// Antrean + salinan foto disimpan di HP, jadi aplikasi ditutup / sinyal hilang = dilanjutkan saat Berita Acara dibuka
/// lagi. Kirim ulang aman: foto yang sudah terkirim dilewati (sha), simpan BA idempoten (baId), PDF boleh dibuat ulang.

/// Satu foto di antrean. [asli] + [wm] = foto kamera: watermark dibuat ulang kalau No Gardu pesanan berubah.
class FotoTugasBa {
  FotoTugasBa({required this.slot, required this.label, required this.path, required this.sumber, this.asli, this.wm, this.shaTerkirim});
  final String slot;
  final String label;
  String path;
  final String sumber;
  String? asli;
  Map<String, dynamic>? wm; // {ulp, bagian, waktu, koordinat, akurasiM, noGardu}
  String? shaTerkirim;

  Map<String, dynamic> keJson() => {
        'slot': slot, 'label': label, 'path': path, 'sumber': sumber,
        if (asli != null) 'asli': asli, if (wm != null) 'wm': wm, if (shaTerkirim != null) 'shaTerkirim': shaTerkirim,
      };

  factory FotoTugasBa.dariJson(Map<String, dynamic> j) => FotoTugasBa(
        slot: '${j['slot']}', label: '${j['label']}', path: '${j['path']}', sumber: '${j['sumber']}',
        asli: j['asli'] as String?, wm: (j['wm'] as Map?)?.cast<String, dynamic>(), shaTerkirim: j['shaTerkirim'] as String?,
      );
}

enum TahapBa { antre, foto, simpan, pdf, tertunda, gagal }

/// Satu BA di antrean. mode BARU = simpanBaGardu, UBAH = ubahBaGardu (foto = hanya yang diganti).
class TugasBa {
  TugasBa({
    required this.baId,
    required this.userId,
    required this.mode,
    required this.jenis,
    required this.judul,
    required this.isi,
    required this.foto,
    this.prefix,
    this.batalId,
    DateTime? dibuat,
    this.tahap = TahapBa.antre,
    this.ket = '',
    this.galat,
    this.disimpan = false,
  }) : dibuat = dibuat ?? DateTime.now();

  final String baId;
  final String userId;
  final String mode; // BARU | UBAH
  final String jenis;
  String judul; // mis. "PY0242 · Pengoperasian Trafo"
  final Map<String, dynamic> isi; // data simpanBaGardu / ubahBaGardu (tanpa installId)
  final List<FotoTugasBa> foto;
  final String? prefix;
  String? batalId;
  final DateTime dibuat;
  TahapBa tahap;
  String ket;
  String? galat;
  bool disimpan; // BA sudah tersimpan di server (tinggal PDF)

  bool get ubah => mode == 'UBAH';

  Map<String, dynamic> keJson() => {
        'baId': baId, 'userId': userId, 'mode': mode, 'jenis': jenis, 'judul': judul, 'isi': isi,
        'foto': [for (final f in foto) f.keJson()], if (prefix != null) 'prefix': prefix, if (batalId != null) 'batalId': batalId,
        'dibuat': dibuat.toIso8601String(), 'tahap': tahap.name, 'ket': ket, if (galat != null) 'galat': galat, 'disimpan': disimpan,
      };

  factory TugasBa.dariJson(Map<String, dynamic> j) => TugasBa(
        baId: '${j['baId']}', userId: '${j['userId']}', mode: '${j['mode']}', jenis: '${j['jenis']}', judul: '${j['judul']}',
        isi: Map<String, dynamic>.from(j['isi'] as Map),
        foto: [for (final f in (j['foto'] as List? ?? const [])) FotoTugasBa.dariJson(Map<String, dynamic>.from(f as Map))],
        prefix: j['prefix'] as String?, batalId: j['batalId'] as String?, dibuat: DateTime.tryParse('${j['dibuat']}'),
        // proses terputus (app ditutup) = dilanjutkan
        tahap: TahapBa.values.firstWhere((t) => t.name == j['tahap'], orElse: () => TahapBa.antre) == TahapBa.gagal ? TahapBa.gagal : TahapBa.antre,
        ket: '${j['ket'] ?? ''}', galat: j['galat'] as String?, disimpan: j['disimpan'] == true,
      );
}

/// Pesan selesai satu tugas (untuk snackbar / daftar).
class HasilTugasBa {
  const HasilTugasBa(this.baId, this.judul, this.pesan, {this.berhasil = true});
  final String baId;
  final String judul;
  final String pesan;
  final bool berhasil;
}

class AntreanBa extends ChangeNotifier {
  AntreanBa._();
  static final AntreanBa i = AntreanBa._();

  final Map<String, TugasBa> _tugas = {};
  bool _dimuat = false;
  bool _jalan = false;
  final _selesai = StreamController<HasilTugasBa>.broadcast();

  /// Tugas yang selesai / gagal (didengar layar Berita Acara untuk snackbar).
  Stream<HasilTugasBa> get selesai => _selesai.stream;

  List<TugasBa> daftar(String userId) =>
      [for (final t in _tugas.values) if (t.userId == userId) t]..sort((a, b) => b.dibuat.compareTo(a.dibuat));

  Future<int> jumlahTertunda(String userId) async {
    await _muat();
    return daftar(userId).length;
  }

  bool adaUntuk(String baId) => _tugas.containsKey(baId);
  bool get berjalan => _jalan;

  Future<Directory> _dir() async {
    final d = Directory(p.join((await getApplicationDocumentsDirectory()).path, 'antrean_ba'));
    await d.create(recursive: true);
    return d;
  }

  Future<void> _muat() async {
    if (_dimuat) return;
    _dimuat = true;
    try {
      final d = await _dir();
      await for (final e in d.list()) {
        if (e is! Directory) continue;
        final f = File(p.join(e.path, 'tugas.json'));
        if (!await f.exists()) continue;
        try {
          final t = TugasBa.dariJson(jsonDecode(await f.readAsString()) as Map<String, dynamic>);
          _tugas[t.baId] = t;
        } catch (_) {/* rusak: dilewati */}
      }
    } catch (_) {/* folder belum ada */}
    notifyListeners();
  }

  Future<void> _simpanDisk(TugasBa t) async {
    final d = Directory(p.join((await _dir()).path, t.baId));
    await d.create(recursive: true);
    await File(p.join(d.path, 'tugas.json')).writeAsString(jsonEncode(t.keJson()), flush: true);
  }

  Future<String> _salin(TugasBa t, String path, String nama) async {
    final d = Directory(p.join((await _dir()).path, t.baId));
    await d.create(recursive: true);
    final tujuan = p.join(d.path, '${nama}_${DateTime.now().microsecondsSinceEpoch}${p.extension(path).isEmpty ? '.jpg' : p.extension(path)}');
    await File(path).copy(tujuan);
    return tujuan;
  }

  Future<void> _hapusDisk(String baId) async {
    try {
      final d = Directory(p.join((await _dir()).path, baId));
      if (await d.exists()) await d.delete(recursive: true);
    } catch (_) {/* dibiarkan */}
  }

  /// Masukkan tugas (foto disalin ke folder antrean supaya tidak hilang dibersihkan sistem), lalu jalankan.
  Future<void> tambah(Deps deps, Sesi s, TugasBa t) async {
    await _muat();
    for (final f in t.foto) {
      f.path = await _salin(t, f.path, f.slot);
      if (f.asli != null) f.asli = await _salin(t, f.asli!, '${f.slot}_asli');
    }
    _tugas[t.baId] = t;
    await _simpanDisk(t);
    notifyListeners();
    unawaited(jalankan(deps, s));
  }

  /// Lanjutkan semua tugas akun ini yang belum selesai (tidak menyentuh yang GAGAL kecuali [ulangGagal]).
  Future<void> jalankan(Deps deps, Sesi s) async {
    await _muat();
    if (_jalan) return;
    _jalan = true;
    try {
      while (true) {
        final berikut = daftar(s.userId).reversed.where((t) => t.tahap != TahapBa.gagal).toList();
        if (berikut.isEmpty) break;
        final t = berikut.first;
        final ok = await _kerjakan(deps, s, t);
        if (!ok) {
          // tertunda (sinyal) = berhenti, dicoba lagi saat dibuka ulang; gagal = lanjut tugas lain
          if (t.tahap == TahapBa.tertunda) break;
          if (daftar(s.userId).every((x) => x.tahap == TahapBa.gagal)) break;
        }
      }
    } finally {
      _jalan = false;
      notifyListeners();
    }
  }

  /// Coba lagi satu tugas gagal.
  Future<void> coba(Deps deps, Sesi s, String baId) async {
    final t = _tugas[baId];
    if (t == null) return;
    t.tahap = TahapBa.antre;
    t.galat = null;
    await _simpanDisk(t);
    notifyListeners();
    await jalankan(deps, s);
  }

  /// Buang tugas gagal (BA belum tersimpan = isian hilang; nomor pesanan dilepas).
  Future<void> buang(Deps deps, Sesi s, String baId) async {
    final t = _tugas.remove(baId);
    notifyListeners();
    await _hapusDisk(baId);
    if (t != null && !t.ubah && !t.disimpan) {
      try {
        await BaRepository(deps.api).lepasNomor(s, baId);
      } catch (_) {/* hangus sendiri */}
    }
  }

  void _atur(TugasBa t, TahapBa tahap, String ket) {
    t.tahap = tahap;
    t.ket = ket;
    notifyListeners();
  }

  /// true = selesai (dihapus dari antrean).
  Future<bool> _kerjakan(Deps deps, Sesi s, TugasBa t) async {
    final repo = BaRepository(deps.api);
    try {
      if (!t.disimpan) {
        if (t.ubah) {
          await _kirimFoto(repo, s, t, revisi: true);
          _atur(t, TahapBa.simpan, 'Menyimpan perubahan BA...');
          final h = await repo.ubah(s, t.isi);
          t.judul = '${h['noGardu'] ?? ''} · ${t.jenis}';
        } else {
          for (var coba = 1;; coba++) {
            await _segarkanNomor(repo, s, t);
            await _kirimFoto(repo, s, t);
            _atur(t, TahapBa.simpan, 'Membuat nomor BA & mencatat gardu...');
            try {
              final h = await repo.simpan(s, {...t.isi, 'installId': await deps.sessionStore.installId()});
              t.judul = '${h['noGardu'] ?? ''} · ${t.jenis}';
              break;
            } on ApiException catch (e) {
              if (e.kode != 'NOMOR_GARDU_BERUBAH' || coba >= 2) rethrow;
            }
          }
        }
        t.disimpan = true;
        await _simpanDisk(t);
      }
      _atur(t, TahapBa.pdf, 'Membuat PDF BA...');
      String pesan;
      try {
        await repo.buatPdf(s, t.baId);
        pesan = '${t.judul}: ${t.ubah ? 'perubahan tersimpan' : 'BA tersimpan'}, PDF siap.';
      } on ApiException catch (e) {
        pesan = '${t.judul}: BA tersimpan, PDF belum (${KodeError.pesan(e.kode)}). Buat ulang dari Daftar BA.';
      }
      _tugas.remove(t.baId);
      await _hapusDisk(t.baId);
      notifyListeners();
      _selesai.add(HasilTugasBa(t.baId, t.judul, pesan));
      unawaited(deps.gardu.segarkan(s).catchError((Object _) => false));
      return true;
    } on ApiException catch (e) {
      final sementara = e.kode.startsWith('HTTP_') || e.kode == 'TERLALU_SERING' || e.kode == 'SERVER_SIBUK';
      t.galat = sementara ? 'Sinyal / server bermasalah, dicoba lagi otomatis.' : pesanApiBa(e);
      _atur(t, sementara ? TahapBa.tertunda : TahapBa.gagal, t.galat!);
      await _simpanDisk(t);
      if (!sementara) _selesai.add(HasilTugasBa(t.baId, t.judul, '${t.judul}: ${t.galat}', berhasil: false));
      return false;
    } on StateError catch (e) {
      t.galat = 'Foto tidak bisa disiapkan (${e.message}). Buang lalu buat ulang BA ini.';
      _atur(t, TahapBa.gagal, t.galat!);
      await _simpanDisk(t);
      _selesai.add(HasilTugasBa(t.baId, t.judul, '${t.judul}: ${t.galat}', berhasil: false));
      return false;
    } catch (_) {
      t.galat = 'Gagal terhubung, dicoba lagi otomatis saat Berita Acara dibuka.';
      _atur(t, TahapBa.tertunda, t.galat!);
      await _simpanDisk(t);
      return false;
    }
  }

  /// BA baru: pastikan nomor pesanan + samakan watermark foto kamera (render ulang dari foto asli kalau berubah).
  Future<void> _segarkanNomor(BaRepository repo, Sesi s, TugasBa t) async {
    final pre = t.prefix;
    if (pre == null) return;
    _atur(t, TahapBa.foto, 'Cek nomor gardu pesanan...');
    final Map<String, dynamic> n;
    try {
      n = await repo.pesanNomor(s, baId: t.baId, prefix: pre, nomorBatalId: t.batalId);
    } on ApiException catch (e) {
      if (e.kode == 'BA_SUDAH_DISIMPAN') return; // jawaban simpan sebelumnya hilang di jalan: simpan ulang = DUPLIKAT
      rethrow;
    }
    t.batalId = n['asal'] == 'ULANG BATAL' ? '${n['garduId']}' : null;
    if (t.batalId != null) {
      t.isi['nomorBatalId'] = t.batalId;
    } else {
      t.isi.remove('nomorBatalId');
    }
    final no = '${n['nomor'] ?? ''}';
    for (final f in t.foto) {
      final wm = f.wm, asli = f.asli;
      if (wm == null || asli == null || wm['noGardu'] == no) continue;
      final d = watermarkBa(
          ulp: '${wm['ulp']}', jenisBa: t.jenis, noGardu: no, bagian: '${wm['bagian']}', waktu: DateTime.parse('${wm['waktu']}'),
          koordinat: wm['koordinat'] as String?, akurasiM: (wm['akurasiM'] as num?)?.toDouble());
      final baru = await pasangWatermarkBa(asli, d, '${t.baId.substring(0, 8)}_${f.slot}');
      f.path = await _salin(t, baru, f.slot);
      f.wm = {...wm, 'noGardu': no};
      f.shaTerkirim = null;
    }
    if (t.foto.any((f) => f.wm != null)) t.isi['noGarduWatermark'] = no;
    t.judul = '$no · ${t.jenis}';
    await _simpanDisk(t);
  }

  Future<void> _kirimFoto(BaRepository repo, Sesi s, TugasBa t, {bool revisi = false}) async {
    for (var k = 0; k < t.foto.length; k++) {
      final f = t.foto[k];
      _atur(t, TahapBa.foto, 'Foto ${k + 1}/${t.foto.length} · ${f.label}...');
      final jpeg = await compute(siapkanJpegBa, await File(f.path).readAsBytes());
      if (f.shaTerkirim != null && f.shaTerkirim == shaHexBa(jpeg)) continue;
      f.shaTerkirim = await repo.uploadFoto(s, baId: t.baId, jenis: t.jenis, slot: f.slot, sumber: f.sumber, jpeg: jpeg, revisi: revisi);
      await _simpanDisk(t);
    }
  }
}
