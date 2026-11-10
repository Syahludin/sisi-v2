import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';

import '../../core/api_client.dart';
import 'wo_bantu.dart';
import 'wo_simpanan.dart';

/// v1.0.16 (permintaan Master Guswan 22 Okt 2026): penerusan / pindah / tarik WO admin diproses di LATAR. Setelah tim dipilih,
/// WO langsung hilang dari daftar Penerusan WO dan dikirim berurutan di belakang layar (Apps Script beberapa detik per
/// panggilan). Gagal = kartu galat dengan Coba lagi / Batalkan, WO tampil lagi. Antrean hidup selama app terbuka
/// (pindah layar tidak menghentikannya).
/// v1.0.17 (permintaan Master Guswan 22 Okt 2026): offline lebih stabil. Galat sinyal tidak langsung jadi kartu gagal: item tetap
/// "Sedang Proses Kirim ke Tim" dan dicoba ulang otomatis dengan jeda bertahap (tanpa menahan layar), serta langsung
/// saat koneksi pulih ([sinyalPulih]). Baru jadi kartu gagal sesudah [maksCobaSinyal] percobaan. Server dibuat idempoten
/// (teruskan ke tim yang sama / tarik yang sudah ditarik = berhasil), jadi kiriman ulang sesudah timeout aman.
/// v1.0.47 (offline): item yang punya [ItemPenerusanWo.aksi] disimpan ke file (SimpananWo) selama belum berhasil, jadi
/// app ditutup / HP mati tidak menghilangkan kiriman. Dipulihkan saat layar WO dibuka lagi oleh akun yang sama
/// ([pulihkan]) lalu dikirim begitu ada sinyal.
class PenerusanWo extends ChangeNotifier {
  PenerusanWo._();
  static final PenerusanWo i = PenerusanWo._();

  static const proses = 'PROSES', gagal = 'GAGAL', selesai = 'SELESAI';

  final List<ItemPenerusanWo> _antre = [];
  bool _jalan = false;
  Timer? _jeda;

  /// Percobaan ulang otomatis untuk galat sinyal sebelum item ditandai gagal.
  static const maksCobaSinyal = 6;

  /// Jeda sebelum percobaan ke-n (n mulai 1). Bisa diganti test.
  @visibleForTesting
  Duration Function(int n) jedaUlang = (n) => Duration(seconds: const [2, 5, 10, 20, 40, 60][(n - 1).clamp(0, 5)]);

  List<ItemPenerusanWo> get antre => List.unmodifiable(_antre);

  /// Lokasi file antrean. Bisa diganti test.
  @visibleForTesting
  Future<File?> Function() berkas = SimpananWo.fileAntrean;

  /// Akun yang item tersimpannya sudah dimuat ke memori (file = isi memori untuk akun ini).
  final Set<String> _dimuat = {};
  /// userId|temuanId yang pernah ada di memori: versi memori yang berlaku (berhasil / dibatalkan = tidak ditulis lagi).
  final Set<String> _dikenal = {};
  final Set<String> _sudahPulih = {};
  Future<void> _tulis = Future.value();

  Future<List<Map<String, dynamic>>> _bacaFile() async {
    try {
      final f = await berkas();
      if (f == null || !await f.exists()) return [];
      return (jsonDecode(await f.readAsString()) as List<dynamic>).whereType<Map<dynamic, dynamic>>().map(Map<String, dynamic>.from).toList();
    } catch (_) {
      return []; // file rusak: mulai kosong
    }
  }

  /// Muat item tersimpan milik [userId] (sekali per akun per proses app) dengan pengirim [kirim] sesi sekarang.
  /// Baca file lewat antrean tulis yang sama, jadi tidak balapan dengan [tambah].
  Future<void> pulihkan(String userId, Future<void> Function(String aksi, Map<String, dynamic> data) kirim,
      {void Function(bool berhasil)? selesai}) async {
    if (userId.isEmpty || !_sudahPulih.add(userId)) return;
    var ada = false;
    final langkah = _tulis.then((_) async {
      for (final j in await _bacaFile()) {
        if ('${j['userId']}' != userId) continue;
        final id = '${j['temuanId']}';
        if (id.isEmpty || _antre.any((x) => x.temuanId == id)) continue;
        final aksi = '${j['aksi']}', data = Map<String, dynamic>.from(j['data'] as Map? ?? const {});
        _dikenal.add('$userId|$id');
        _antre.add(ItemPenerusanWo(
          temuanId: id, kode: '${j['kode'] ?? ''}', judul: '${j['judul'] ?? ''}', aksi: aksi, data: data, userId: userId,
          kirim: () => kirim(aksi, data), selesai: selesai,
        ));
        ada = true;
      }
      _dimuat.add(userId);
    });
    _tulis = langkah;
    await langkah;
    if (!ada) return;
    notifyListeners();
    unawaited(_proses());
  }

  /// Tulis item yang belum berhasil (berurutan). Item tersimpan akun yang belum dimuat dibiarkan apa adanya.
  void _simpan() {
    _tulis = _tulis.then((_) async {
      try {
        final f = await berkas();
        if (f == null) return;
        final memori = [
          for (final x in _antre)
            if (x.aksi != null && x.userId != null && x.status != selesai)
              {'temuanId': x.temuanId, 'kode': x.kode, 'judul': x.judul, 'aksi': x.aksi, 'data': x.data, 'userId': x.userId},
        ];
        final lain = (await _bacaFile())
            .where((j) => !_dimuat.contains('${j['userId']}') && !_dikenal.contains('${j['userId']}|${j['temuanId']}'));
        final tmp = File('${f.path}.tmp');
        await tmp.writeAsString(jsonEncode([...lain, ...memori]), flush: true);
        await tmp.rename(f.path);
      } catch (_) {/* tetap di memori */}
    });
  }

  /// Selesai menulis file (test).
  @visibleForTesting
  Future<void> get tulisSelesai => _tulis;

  /// Temuan yang disembunyikan dari daftar: sedang diproses / baru berhasil (sampai daftar dimuat ulang).
  Set<String> get disembunyikan => {for (final x in _antre) if (x.status != gagal) x.temuanId};

  int get jumlahProses => _antre.where((x) => x.status == proses).length;

  List<ItemPenerusanWo> get daftarGagal => _antre.where((x) => x.status == gagal).toList();

  void tambah(ItemPenerusanWo x) {
    _antre.removeWhere((y) => y.temuanId == x.temuanId);
    _antre.add(x);
    if (x.userId != null) _dikenal.add('${x.userId}|${x.temuanId}');
    _simpan();
    notifyListeners();
    unawaited(_proses());
  }

  void cobaLagi(ItemPenerusanWo x) {
    x
      ..status = proses
      ..galat = null
      ..coba = 0
      ..menunggu = false;
    notifyListeners();
    unawaited(_proses());
  }

  void batalkan(ItemPenerusanWo x) {
    _antre.remove(x);
    _simpan();
    notifyListeners();
  }

  /// v1.0.17: koneksi pulih (SyncController online) = kirim ulang item yang tertahan sinyal tanpa menunggu jeda.
  void sinyalPulih() {
    var ada = false;
    for (final x in _antre) {
      x.menunggu = false;
      if (x.status == gagal && x.galatSinyal) {
        x
          ..status = proses
          ..galat = null
          ..coba = 0;
        ada = true;
      } else if (x.status == proses && x.coba > 0) {
        ada = true;
      }
    }
    if (!ada) return;
    _jeda?.cancel();
    _jeda = null;
    notifyListeners();
    unawaited(_proses());
  }

  /// Daftar sudah dimuat ulang dari server: item berhasil tidak perlu disembunyikan lagi.
  void bersihkanSelesai() {
    final n = _antre.length;
    _antre.removeWhere((x) => x.status == selesai);
    if (n != _antre.length) notifyListeners();
  }

  Future<void> _proses() async {
    if (_jalan) return;
    _jalan = true;
    try {
      while (true) {
        final x = _antre.where((y) => y.status == proses && !y.menunggu).firstOrNull;
        if (x == null) break;
        try {
          await x.kirim();
          x
            ..status = selesai
            ..galatSinyal = false;
        } on ApiException catch (e) {
          if (e.kode.startsWith('HTTP_')) {
            _tundaSinyal(x);
          } else {
            x
              ..status = gagal
              ..galatSinyal = false
              ..galat = pesanWo(e.kode);
          }
        } catch (_) {
          _tundaSinyal(x);
        }
        if (x.status != proses) _simpan();
        notifyListeners();
        if (x.status != proses) x.selesai?.call(x.status == selesai);
      }
    } finally {
      _jalan = false;
    }
  }

  /// Galat sinyal: tetap PROSES dan dicoba lagi sesudah jeda; habis percobaan = gagal (bisa Coba lagi / otomatis saat
  /// sinyal pulih).
  void _tundaSinyal(ItemPenerusanWo x) {
    x.coba++;
    x.galatSinyal = true;
    if (x.coba >= maksCobaSinyal) {
      x
        ..status = gagal
        ..galat = 'Belum terkirim (sinyal). Dikirim lagi otomatis saat sinyal pulih, atau ketuk Coba lagi.';
      return;
    }
    x.menunggu = true;
    _jeda?.cancel();
    _jeda = Timer(jedaUlang(x.coba), () {
      _jeda = null;
      for (final y in _antre) {
        y.menunggu = false;
      }
      unawaited(_proses());
    });
  }
}

class ItemPenerusanWo {
  ItemPenerusanWo(
      {required this.temuanId, required this.kode, required this.judul, required this.kirim, this.selesai, this.aksi, this.data, this.userId});
  final String temuanId, kode;

  /// v1.0.47: endpoint + data kiriman + akun. Ada = item disimpan ke file sampai berhasil (dipulihkan sesudah app ditutup).
  final String? aksi;
  final Map<String, dynamic>? data;
  final String? userId;

  /// Mis. 'Diteruskan ke ROW 01', 'Ditarik dari HARTEK 01'.
  final String judul;
  final Future<void> Function() kirim;

  /// Dipanggil sesudah satu percobaan (true = berhasil), mis. untuk menyegarkan daftar diam-diam.
  final void Function(bool berhasil)? selesai;
  String status = PenerusanWo.proses;
  String? galat;

  /// v1.0.17: jumlah percobaan gagal karena sinyal, sedang menunggu jeda, gagal terakhir karena sinyal.
  int coba = 0;
  bool menunggu = false, galatSinyal = false;
}
