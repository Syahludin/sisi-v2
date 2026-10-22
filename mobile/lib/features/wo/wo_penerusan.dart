import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/api_client.dart';
import 'wo_bantu.dart';

/// v1.0.16 (permintaan kvlar 22 Okt 2026): penerusan / pindah / tarik WO admin diproses di LATAR. Setelah tim dipilih,
/// WO langsung hilang dari daftar Penerusan WO dan dikirim berurutan di belakang layar (Apps Script beberapa detik per
/// panggilan). Gagal = kartu galat dengan Coba lagi / Batalkan, WO tampil lagi. Antrean hidup selama app terbuka
/// (pindah layar tidak menghentikannya).
/// v1.0.17 (permintaan kvlar 22 Okt 2026): offline lebih stabil. Galat sinyal tidak langsung jadi kartu gagal: item tetap
/// "Sedang Proses Kirim ke Tim" dan dicoba ulang otomatis dengan jeda bertahap (tanpa menahan layar), serta langsung
/// saat koneksi pulih ([sinyalPulih]). Baru jadi kartu gagal sesudah [maksCobaSinyal] percobaan. Server dibuat idempoten
/// (teruskan ke tim yang sama / tarik yang sudah ditarik = berhasil), jadi kiriman ulang sesudah timeout aman.
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

  /// Temuan yang disembunyikan dari daftar: sedang diproses / baru berhasil (sampai daftar dimuat ulang).
  Set<String> get disembunyikan => {for (final x in _antre) if (x.status != gagal) x.temuanId};

  int get jumlahProses => _antre.where((x) => x.status == proses).length;

  List<ItemPenerusanWo> get daftarGagal => _antre.where((x) => x.status == gagal).toList();

  void tambah(ItemPenerusanWo x) {
    _antre.removeWhere((y) => y.temuanId == x.temuanId);
    _antre.add(x);
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
  ItemPenerusanWo({required this.temuanId, required this.kode, required this.judul, required this.kirim, this.selesai});
  final String temuanId, kode;

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
