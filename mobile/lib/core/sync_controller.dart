import 'dart:async';

import 'package:flutter/foundation.dart';

import '../features/row/foto_repository.dart';
import '../features/row/laporan_repository.dart';
import '../features/row/row_outbox.dart';
import '../features/row/sync_service.dart';
import 'api_client.dart';
import 'kode_error.dart';
import 'sesi.dart';

/// Sync otomatis selama app terbuka (keputusan 3 Okt 2026): saat app dibuka, tiap 5 menit,
/// dan setelah data disimpan. Sync saat app ditutup (WorkManager) ditunda.
class SyncController extends ChangeNotifier {
  SyncController(this._sync, this._outbox, this._foto, this._laporan);

  final SyncService _sync;
  final RowOutbox _outbox;
  final FotoRepository _foto;
  final LaporanRepository _laporan;

  Sesi? _sesi;
  Timer? _timer;
  bool _jalan = false;

  /// null = belum tahu, true = panggilan terakhir ke server berhasil.
  bool? online;
  bool get sedangSync => _jalan;
  int belumTerkirim = 0;
  DateTime? terakhirBerhasil;
  String? pesan;

  /// Dipanggil saat sesi habis (Alur D): app kembali ke login, outbox tetap.
  VoidCallback? onSesiHabis;

  void mulai(Sesi s) {
    _sesi = s;
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(minutes: 5), (_) => sinkron());
    hitungUlang();
  }

  void gantiSesi(Sesi s) => _sesi = s;

  void berhenti() {
    _timer?.cancel();
    _timer = null;
    _sesi = null;
  }

  Future<void> hitungUlang() async {
    final s = _sesi;
    if (s == null) return;
    belumTerkirim = await _outbox.jumlahBelumTerkirim(s.userId) + await _foto.jumlahTertunda(s.userId);
    notifyListeners();
  }

  /// Kirim outbox lalu tarik kode hari ini. Aman dipanggil berkali-kali (tidak dobel jalan).
  Future<void> sinkron() async {
    final s = _sesi;
    if (s == null || _jalan) return;
    // v0.50: admin tidak punya outbox / kode ROW (getKodeRow = AKSES_DITOLAK), jadi tidak ada yang disinkron.
    if (!s.petugasRow) return;
    _jalan = true;
    notifyListeners();
    try {
      final h = await _sync.kirim(s);
      final f = await _foto.kirim(s); // foto setelah eksekusinya diterima server
      await _sync.tarikKode(s);
      if (h.terkirim + f.terkirim > 0 || terakhirBerhasil == null) {
        try {
          await _laporan.segarkanHariIni(s); // status SIAP WA di kartu laporan
        } on ApiException {
          // tidak menggagalkan sync (mis. akun tanpa menu ROW_LAPORAN)
        }
      }
      online = true;
      terakhirBerhasil = DateTime.now();
      final bagian = [
        if (h.terkirim > 0) 'data ${h.terkirim}',
        if (f.terkirim > 0) 'foto ${f.terkirim}',
        if (h.konflik > 0) 'konflik ${h.konflik}',
        if (h.ditolak > 0) 'ditolak ${h.ditolak}',
        if (f.gagal > 0) 'foto gagal ${f.gagal}',
      ];
      pesan = bagian.isEmpty ? null : 'Terkirim: ${bagian.join(', ')}.';
    } on ApiException catch (e) {
      if (KodeError.sesiHabis.contains(e.kode)) {
        onSesiHabis?.call();
      } else {
        online = !e.kode.startsWith('HTTP_');
        pesan = KodeError.pesan(e.kode);
      }
    } catch (_) {
      online = false;
      pesan = 'Offline. Data aman di HP, dikirim otomatis saat ada sinyal.';
    } finally {
      _jalan = false;
      await hitungUlang();
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}
