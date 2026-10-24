import 'dart:async';

import 'package:flutter/foundation.dart';

import '../features/hartek/hartek_store.dart';
import '../features/insdu/insdu_store.dart';
import '../features/insjar/insjar_store.dart';
import '../features/insjar/temuan_admin_antre.dart';
import '../features/row/foto_repository.dart';
import '../features/row/laporan_repository.dart';
import '../features/row/row_outbox.dart';
import '../features/row/sync_service.dart';
import '../features/wo/wo_store.dart';
import '../features/yandal/p0_sync.dart';
import 'api_client.dart';
import 'kode_error.dart';
import 'kunci_update.dart';
import 'sesi.dart';

/// Sync otomatis selama app terbuka (keputusan 3 Okt 2026): saat app dibuka, tiap 5 menit,
/// dan setelah data disimpan. Sync saat app ditutup (WorkManager) ditunda.
class SyncController extends ChangeNotifier {
  SyncController(this._sync, this._outbox, this._foto, this._laporan,
      {P0Sync? p0,
      Future<String> Function()? installId,
      HartekStore? hartek,
      InsJarStore? insjar,
      InsDuStore? insdu,
      WoStore? wo,
      AntreanTemuanAdmin? temuanAdmin,
      Future<void> Function()? probeOnline})
      : _p0 = p0,
        _installId = installId,
        _hartek = hartek,
        _insjar = insjar,
        _insdu = insdu,
        _wo = wo,
        _temuanAdmin = temuanAdmin,
        _probeOnline = probeOnline;

  final SyncService _sync;
  final RowOutbox _outbox;
  final FotoRepository _foto;
  final LaporanRepository _laporan;
  final P0Sync? _p0; // v0.65.0: P0 Yandal
  final Future<String> Function()? _installId;
  final HartekStore? _hartek; // v0.95.0: Hartek lokal + kirim otomatis
  final InsJarStore? _insjar; // v1.0.0: Inspeksi Jaringan lokal + kirim otomatis
  final InsDuStore? _insdu; // v1.0.12: Inspeksi Gardu lokal + kirim otomatis
  final WoStore? _wo; // v1.0.16: WO tindak lanjut tim offline + kirim otomatis
  final AntreanTemuanAdmin? _temuanAdmin; // v1.0.29: temuan inspeksi admin, kirim di latar (tanpa hitungan / pesan)
  final Future<void> Function()? _probeOnline; // v1.0.3: cek koneksi tanpa menunggu ada data antrean

  /// v0.95.0: sinkron diminta saat sync lain berjalan (mis. data Hartek baru disimpan) = jalan lagi sesudahnya.
  bool _lagi = false;

  Sesi? _sesi;
  Timer? _timer;
  Timer? _timerProbe;
  bool _jalan = false;
  bool _probeJalan = false;

  /// null = belum tahu, true = panggilan terakhir ke server berhasil.
  bool? online;
  bool get sedangSync => _jalan;
  int belumTerkirim = 0;

  /// v0.62 (M4): operasi KONFLIK / DITOLAK yang menunggu tindakan petugas (Pusat Masalah).
  int perluTindakan = 0;

  /// v0.62.5: foto GAGAL (eksekusi masih AKTIF) tidak dikirim otomatis, jadi ikut menahan logout.
  int fotoGagal = 0;
  DateTime? terakhirBerhasil;
  String? pesan;

  /// Dipanggil saat sesi habis (Alur D): app kembali ke login, outbox tetap.
  VoidCallback? onSesiHabis;

  void mulai(Sesi s) {
    // v0.62.5: akun lain di HP yang sama = status & hitungan akun sebelumnya tidak boleh terbawa.
    if (_sesi?.userId != s.userId || _sesi?.token != s.token) {
      belumTerkirim = 0;
      perluTindakan = 0;
      fotoGagal = 0;
      online = null;
      pesan = null;
      terakhirBerhasil = null;
    }
    _sesi = s;
    _timer?.cancel();
    _timerProbe?.cancel();
    // v1.0.3: status ONLINE/OFFLINE tidak menunggu sync data 5 menit; ping ringan tiap 15 detik.
    _timerProbe = Timer.periodic(const Duration(seconds: 15), (_) => cekOnline());
    unawaited(cekOnline());
    // v0.65.0: akun YANDAL dikirim lebih sering (P0 berkala selama ada sinyal)
    _timer = Timer.periodic(Duration(minutes: s.petugasYandal ? 2 : 5), (_) => sinkron());
    hitungUlang();
    unawaited(_foto.bersihkanYatim()); // v0.62.8: sisa file dari simpan yang terputus
  }

  void gantiSesi(Sesi s) => _sesi = s;

  void berhenti() {
    _timer?.cancel();
    _timer = null;
    _timerProbe?.cancel();
    _timerProbe = null;
    _sesi = null;
  }

  /// v1.0.3: probe koneksi ke backend, terpisah dari sync data.
  /// Sinyal bar penuh tidak selalu berarti internet tersedia, jadi status hanya ONLINE setelah ping berhasil.
  Future<void> cekOnline() async {
    final s = _sesi;
    final probe = _probeOnline;
    if (s == null || probe == null || _probeJalan) return;
    _probeJalan = true;
    try {
      await probe();
      if (_sesi?.token != s.token) return;
      final pulih = online != true;
      if (pulih) {
        online = true;
        notifyListeners();
        // Koneksi baru pulih: jangan menunggu timer sync 5 menit untuk mengirim antrean.
        unawaited(sinkron());
      }
    } catch (_) {
      if (_sesi?.token != s.token) return;
      if (online != false) {
        online = false;
        pesan ??= 'Offline. Data aman di HP, dikirim otomatis saat ada sinyal.';
        notifyListeners();
      }
    } finally {
      _probeJalan = false;
    }
  }

  /// v0.63.4: data akun [s] yang belum sampai server (outbox + foto tertunda). Dipakai gerbang sync akhir shift YANDAL.
  Future<int> jumlahTertunda(Sesi s) async =>
      await _outbox.jumlahBelumTerkirim(s.userId) + await _foto.jumlahTertunda(s.userId) + await _jumlahP0(s) + await _jumlahHartek(s) + await _jumlahInsJar(s) + await _jumlahInsDu(s) +
      await _jumlahWo(s);

  /// v1.0.16: isian WO tindak lanjut yang belum diterima server.
  Future<int> _jumlahWo(Sesi s) async {
    final w = _wo;
    return s.petugasWo && w != null ? await w.jumlahTertunda(s.userId) : 0;
  }

  /// v1.0.16: kirim antrean WO di latar (punya penjaga jalan-ganda sendiri), terpisah dari sinkron modul tim.
  Future<void> _sinkronWo(Sesi s) async {
    final w = _wo;
    if (w == null || !s.petugasWo) return;
    try {
      await w.kirim(s);
    } on ApiException catch (e) {
      if (KodeError.sesiHabis.contains(e.kode) && _sesi?.token == s.token) onSesiHabis?.call();
    } catch (_) {
      // offline: antrean tetap di HP
    }
    if (_sesi?.token == s.token) await hitungUlang();
  }

  /// v1.0.12: data Inspeksi Gardu yang belum diterima server.
  Future<int> _jumlahInsDu(Sesi s) async {
    final i = _insdu;
    return s.petugasInsGardu && i != null ? await i.jumlahTertunda(s.userId) : 0;
  }

  /// v1.0.0: data Inspeksi Jaringan tim yang belum diterima server.
  Future<int> _jumlahInsJar(Sesi s) async {
    final i = _insjar;
    return s.petugasInsJar && i != null ? await i.jumlahTertunda(s.userId) : 0;
  }

  /// v0.95.0: data Hartek tim yang belum diterima server (menunggu + ditolak).
  Future<int> _jumlahHartek(Sesi s) async {
    final h = _hartek;
    return s.petugasHartek && h != null ? await h.jumlahTertunda(s.userId) : 0;
  }

  /// v0.65.0: P0 Yandal shift ini yang belum terkirim (data / foto disimpan / tanda final akhir shift).
  Future<int> _jumlahP0(Sesi s) async {
    final p0 = _p0;
    return s.petugasYandal && p0 != null ? await p0.jumlahTertunda(s) : 0;
  }

  Future<void> hitungUlang() async {
    final s = _sesi;
    if (s == null) return;
    final belum = await _outbox.jumlahBelumTerkirim(s.userId) +
        await _foto.jumlahTertunda(s.userId) +
        await _jumlahP0(s) +
        await _jumlahHartek(s) +
        await _jumlahInsJar(s) +
        await _jumlahInsDu(s) +
        await _jumlahWo(s);
    final tindakan = await _outbox.jumlahPerluTindakan(s.userId);
    final gagal = await _foto.jumlahGagal(s.userId);
    if (_sesi?.userId != s.userId) return; // v0.62.5: sesi berganti selama menghitung
    belumTerkirim = belum;
    perluTindakan = tindakan;
    fotoGagal = gagal;
    notifyListeners();
  }

  /// v0.62 (M4): jalankan [fn] (Hapus / Batal / Minta nomor baru / Gabungkan) tanpa sync yang sedang jalan,
  /// supaya operasi tidak dihapus / diganti saat sedang dikirim. Menunggu sync selesai maks 90 detik.
  Future<T> tanpaSync<T>(Future<T> Function() fn) async {
    for (var i = 0; _jalan && i < 300; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 300));
    }
    if (_jalan) throw StateError('Sinkron masih berjalan. Coba lagi sebentar.');
    _jalan = true;
    notifyListeners();
    try {
      return await fn();
    } finally {
      _jalan = false;
      await hitungUlang();
    }
  }

  /// Kirim outbox lalu tarik kode hari ini. Aman dipanggil berkali-kali (tidak dobel jalan).
  Future<void> sinkron() async {
    final s = _sesi;
    if (s == null) return;
    // v1.0.22: aplikasi wajib update = sinkron mati (antrean tetap di HP, dikirim sesudah update)
    if (KunciUpdate.aktif.value) {
      if (pesan != KunciUpdate.pesan) {
        pesan = KunciUpdate.pesan;
        notifyListeners();
      }
      return;
    }
    unawaited(_sinkronWo(s)); // v1.0.16
    final ta = _temuanAdmin;
    if (ta != null && s.bisaUbah(AntreanTemuanAdmin.menu)) unawaited(ta.kirim(s)); // v1.0.29: penjaga jalan-ganda sendiri
    if (_jalan) {
      if (s.petugasHartek || s.petugasInsJar || s.petugasInsGardu) _lagi = true;
      return;
    }
    final p0 = _p0;
    if (s.petugasYandal && p0 != null) return _sinkronP0(s, p0);
    final hartek = _hartek;
    if (s.petugasHartek && hartek != null) return _sinkronHartek(s, hartek);
    final insjar = _insjar;
    if (s.petugasInsJar && insjar != null) return _sinkronInsJar(s, insjar);
    final insdu = _insdu;
    if (s.petugasInsGardu && insdu != null) return _sinkronInsDu(s, insdu);
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
        // v0.62.6: sync lama yang selesai setelah ganti akun tidak boleh mengakhiri sesi baru
        if (_sesi?.token == s.token) onSesiHabis?.call();
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

  /// v0.65.0: kirim P0 Yandal (data + foto disimpan + tanda final akhir shift).
  Future<void> _sinkronP0(Sesi s, P0Sync p0) async {
    _jalan = true;
    notifyListeners();
    try {
      final ambilInstall = _installId;
      final h = await p0.kirim(s, installId: ambilInstall == null ? '' : await ambilInstall());
      online = true;
      terakhirBerhasil = DateTime.now();
      pesan = h.gagal > 0
          ? '${h.gagal} P0 ditolak server. Buka P0 untuk melihat alasannya.'
          : h.terkirim > 0
              ? 'Terkirim: P0 ${h.terkirim}.'
              : null;
    } on ApiException catch (e) {
      if (KodeError.sesiHabis.contains(e.kode)) {
        if (_sesi?.token == s.token) onSesiHabis?.call();
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

  /// v1.0.17: segel sinkron atomik laporan sesudah kirim + tarik. Segel gagal (mis. backend lama belum punya endpoint,
  /// Laporan Utama belum ada) tidak menggagalkan sinkron data; sesi habis / jaringan putus tetap diteruskan.
  Future<void> _segel(Future<void> Function() f) async {
    try {
      await f();
    } on ApiException catch (e) {
      if (KodeError.sesiHabis.contains(e.kode) || HartekStore.putus(e.kode)) rethrow;
    }
  }

  /// v0.95.0: kirim antrean Hartek, tarik laporan hari ini (data perangkat lain tim), siapkan master dropdown.
  Future<void> _sinkronHartek(Sesi s, HartekStore h) async {
    _jalan = true;
    _lagi = false;
    notifyListeners();
    try {
      final k = await h.kirim(s);
      await h.tarik(s);
      await _segel(() => h.segelLaporan(s)); // v1.0.17: sinkron atomik
      try {
        await h.segarkanMaster(s);
      } on ApiException catch (e) {
        if (KodeError.sesiHabis.contains(e.kode)) rethrow; // master gagal tidak menggagalkan kirim laporan
      }
      online = true;
      terakhirBerhasil = DateTime.now();
      pesan = k.gagal > 0
          ? '${k.gagal} data Hartek ditolak server. Buka rincian pekerjaan untuk melihat alasannya.'
          : k.terkirim > 0
              ? 'Terkirim: Hartek ${k.terkirim}.'
              : null;
    } on ApiException catch (e) {
      if (KodeError.sesiHabis.contains(e.kode)) {
        if (_sesi?.token == s.token) onSesiHabis?.call();
      } else {
        online = !HartekStore.putus(e.kode);
        pesan = KodeError.pesan(e.kode);
      }
    } catch (_) {
      online = false;
      pesan = 'Offline. Data aman di HP, dikirim otomatis saat ada sinyal.';
    } finally {
      _jalan = false;
      await hitungUlang();
      if (_lagi && _sesi?.token == s.token) {
        _lagi = false;
        unawaited(sinkron());
      }
    }
  }

  /// v1.0.0: kirim antrean Inspeksi Jaringan, tarik laporan hari ini, siapkan master dropdown.
  Future<void> _sinkronInsJar(Sesi s, InsJarStore i) async {
    _jalan = true;
    _lagi = false;
    notifyListeners();
    try {
      final k = await i.kirim(s);
      await i.tarik(s);
      await _segel(() => i.segelLaporan(s)); // v1.0.17: sinkron atomik
      try {
        await i.segarkanMaster(s);
      } on ApiException catch (e) {
        if (KodeError.sesiHabis.contains(e.kode)) rethrow;
      }
      online = true;
      terakhirBerhasil = DateTime.now();
      pesan = k.gagal > 0
          ? '${k.gagal} data inspeksi ditolak server. Buka penyulang utama untuk melihat alasannya.'
          : k.terkirim > 0
              ? 'Terkirim: Inspeksi ${k.terkirim}.'
              : null;
    } on ApiException catch (e) {
      if (KodeError.sesiHabis.contains(e.kode)) {
        if (_sesi?.token == s.token) onSesiHabis?.call();
      } else {
        online = !HartekStore.putus(e.kode);
        pesan = KodeError.pesan(e.kode);
      }
    } catch (_) {
      online = false;
      pesan = 'Offline. Data aman di HP, dikirim otomatis saat ada sinyal.';
    } finally {
      _jalan = false;
      await hitungUlang();
      if (_lagi && _sesi?.token == s.token) {
        _lagi = false;
        unawaited(sinkron());
      }
    }
  }

  /// v1.0.12: kirim antrean Inspeksi Gardu (termasuk WBP susulan), tarik laporan hari ini + tunggakan, master dropdown.
  Future<void> _sinkronInsDu(Sesi s, InsDuStore i) async {
    _jalan = true;
    _lagi = false;
    notifyListeners();
    try {
      final k = await i.kirim(s);
      await i.tarik(s);
      await _segel(() => i.segelLaporan(s)); // v1.0.17: sinkron atomik
      try {
        await i.segarkanMaster(s);
      } on ApiException catch (e) {
        if (KodeError.sesiHabis.contains(e.kode)) rethrow;
      }
      online = true;
      terakhirBerhasil = DateTime.now();
      pesan = k.gagal > 0
          ? '${k.gagal} data inspeksi gardu ditolak server. Lihat tanda merah di kartu gardu.'
          : k.terkirim > 0
              ? 'Terkirim: Inspeksi Gardu ${k.terkirim}.'
              : null;
    } on ApiException catch (e) {
      if (KodeError.sesiHabis.contains(e.kode)) {
        if (_sesi?.token == s.token) onSesiHabis?.call();
      } else {
        online = !HartekStore.putus(e.kode);
        pesan = KodeError.pesan(e.kode);
      }
    } catch (_) {
      online = false;
      pesan = 'Offline. Data aman di HP, dikirim otomatis saat ada sinyal.';
    } finally {
      _jalan = false;
      await hitungUlang();
      if (_lagi && _sesi?.token == s.token) {
        _lagi = false;
        unawaited(sinkron());
      }
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _timerProbe?.cancel();
    super.dispose();
  }
}
