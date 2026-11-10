import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';

import '../../core/api_client.dart';
import '../../core/jam_terpercaya.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import 'p0_model.dart';
import 'p0_repository.dart';

/// v0.65.0 (keputusan Master Guswan 8 Okt 2026): kirim P0 shift berjalan ke server (yan_P0) berkala selama ada sinyal,
/// dan setiap kali P0 dibuat / foto disimpan. Urutan per P0: data P0 (kode resmi dari server) > foto yang sudah
/// DISIMPAN (Sebelum > Pekerjaan > Sesudah) > di akhir shift tanda final (foto belum disimpan dikunci otomatis dulu).
/// Server: P0 final tanpa foto Sesudah = Rejected SISTEM "P0 Tidak Selesai", nilai 0.
class P0Sync {
  P0Sync(this._api, this._repo, this._jam);

  final ApiClient _api;
  final P0Repository _repo;
  final JamTerpercaya _jam;

  /// Gangguan sementara (sinyal / server / rem): berhenti, dicoba lagi putaran berikutnya.
  static bool _sementara(ApiException e) =>
      KodeError.sesiHabis.contains(e.kode) ||
      e.kode.startsWith('HTTP_') ||
      e.kode == KodeError.serverSibuk ||
      e.kode == KodeError.terlaluSering ||
      e.kode == 'FOTO_TIDAK_PRIVAT' ||
      e.kode == 'CONFIG_TIDAK_LENGKAP' ||
      // v0.66.2: sheet / header server belum disiapkan admin (mis. yan_Switching belum dibuat): dicoba lagi otomatis,
      // bukan ditandai ditolak (dulu P0 macet sampai petugas menekan Kirim lagi).
      e.kode == 'SHEET_TIDAK_ADA' ||
      e.kode == 'CONFIG_TIDAK_VALID' ||
      e.kode == 'HEADER_KOSONG';

  bool akhirShift(Sesi s) => s.habisShift(_jam.sekarang());

  Future<int> jumlahTertunda(Sesi s) => _repo.jumlahTertunda(s, akhirShift: akhirShift(s));

  Map<String, dynamic> _data(P0Lokal x, String installId, {required bool akhir}) => {
        'p0Id': x.id,
        'shiftId': x.shiftId,
        'namaPekerjaan': x.namaPekerjaan,
        'pekerjaanLainnya': x.pekerjaanLainnya,
        'penyulang': x.penyulang,
        'sectionId': x.sectionId,
        'daerah': x.daerah,
        'catatan': x.catatan,
        'dibuat': x.dibuat.toUtc().toIso8601String(),
        'dibuatHp': x.dibuatHp.toUtc().toIso8601String(),
        'sumberWaktu': x.sumberWaktu == 'SERVER' ? 'SERVER' : 'HP',
        if (installId.isNotEmpty) 'installId': installId,
        'slotHp': x.slotDisimpan.join(','),
        'final': akhir,
        if (x.lokasiBelumTerkirim) 'ubahLokasi': true, // v0.66.4: lokasi diedit sesudah terkirim
        if (x.lokasiBelumTerkirim && x.lokasiDiubah != null) 'lokasiDiubah': x.lokasiDiubah!.toUtc().toIso8601String(), // v0.66.5
      };

  /// Isi kiriman satu foto (P0 / switching).
  static Map<String, dynamic> _dataFoto(FotoP0 f, List<int> bytes) => {
        'sumber': f.sumber,
        'sha256': sha256.convert(bytes).toString(),
        'ukuranByte': bytes.length,
        'data': base64Encode(bytes),
        'waktu': f.waktu.toUtc().toIso8601String(),
        'waktuHp': f.waktuHp.toUtc().toIso8601String(),
        'sumberWaktu': f.sumberWaktu == 'SERVER' ? 'SERVER' : 'HP',
        if (f.lat != null && f.lng != null) ...{'lat': f.lat, 'lng': f.lng},
        if (f.akurasiM != null) 'akurasiM': f.akurasiM,
        if (f.gpsSusulanDetik != null && f.lat != null && f.lng != null) 'gpsSusulanDetik': f.gpsSusulanDetik, // v0.65.2
      };

  /// v0.66.0: kirim semua switching P0 ini (data dulu, lalu foto ARUS > GANGGUAN_n yang sudah disimpan).
  Future<({P0Lokal p0, int n})> _kirimSwitching(Sesi s, P0Lokal x, String installId) async {
    var n = 0;
    for (final awal in x.switching) {
      if (!awal.disimpan) continue; // v0.75.0: draf belum dikirim
      var w = awal;
      if (w.perluKirimData) {
        final arus = w.arus;
        final d = await _api.call('simpanSwitchingYandal', token: s.token, data: {
          'switchingId': w.id,
          'p0Id': x.id,
          'sectionId': w.sectionId,
          'indikatorRemote': w.indikator['Remote'],
          'indikatorLocal': w.indikator['Local'],
          'indikatorProtection': w.indikator['Protection'],
          'indikatorReclose': w.indikator['Reclose'],
          'arusR': w.arusR,
          'arusS': w.arusS,
          'arusT': w.arusT,
          if (w.catatan.isNotEmpty) 'catatan': w.catatan,
          'dibuat': w.dibuat.toUtc().toIso8601String(), // v0.66.2: dicek server di dalam jam shift
          if (installId.isNotEmpty) 'installId': installId,
        });
        x = await _repo.ubahStatusKirim(s.userId, x.id, (k) => k.ubahSwitching(w.id, (e) => e.denganServer(d, arusDikirim: arus))) ?? x;
        w = x.switchingId(w.id) ?? w;
        n++;
      }
      for (final slot in slotSwitching) {
        final f = w.foto[slot];
        if (f == null || !f.terkunci || f.terkirim) continue;
        final file = File(f.path);
        if (!await file.exists()) throw ApiException('FILE_FOTO_HILANG');
        final bytes = await file.readAsBytes();
        final d = await _api.call('uploadFotoSwitchingYandal', token: s.token,
            data: {'switchingId': w.id, 'slot': slot, ..._dataFoto(f, bytes)});
        x = await _repo.ubahStatusKirim(s.userId, x.id,
                (k) => k.ubahSwitching(w.id, (e) => e.denganServer(d, arusDikirim: e.arusTerkirim))) ??
            x;
        w = x.switchingId(w.id) ?? w;
        n++;
      }
    }
    return (p0: x, n: n);
  }

  /// v0.74.0: kirim pengukuran gardu P0 ini (data dulu, lalu foto Beban R > nilai lain > Kondisi yang sudah disimpan).
  Future<({P0Lokal p0, int n})> _kirimGardu(Sesi s, P0Lokal x, String installId) async {
    var n = 0;
    final awal = x.ukurGardu;
    if (awal == null || !awal.disimpan) return (p0: x, n: 0); // v0.75.0: draf belum dikirim
    var g = awal;
    if (g.perluKirimData) {
      final isi = g.isiKirim;
      final d = await _api.call('simpanGarduYandal', token: s.token, data: {
        'ukurId': g.id,
        'p0Id': x.id,
        'garduId': g.garduId,
        for (final v in nilaiGardu) v.kunci: g.nilai[v.kunci],
        if (g.catatan.isNotEmpty) 'catatan': g.catatan,
        'dibuat': g.dibuat.toUtc().toIso8601String(),
        if (installId.isNotEmpty) 'installId': installId,
      });
      x = await _repo.ubahStatusKirim(s.userId, x.id, (k) => k.ubahUkurGardu((e) => e.denganServer(d, dikirim: isi))) ?? x;
      g = x.ukurGardu ?? g;
      n++;
    }
    for (final slot in slotGardu) {
      final f = g.foto[slot];
      if (f == null || !f.terkunci || f.terkirim) continue;
      final file = File(f.path);
      if (!await file.exists()) throw ApiException('FILE_FOTO_HILANG');
      final bytes = await file.readAsBytes();
      final d = await _api.call('uploadFotoGarduYandal', token: s.token, data: {'ukurId': g.id, 'slot': slot, ..._dataFoto(f, bytes)});
      x = await _repo.ubahStatusKirim(s.userId, x.id, (k) => k.ubahUkurGardu((e) => e.denganServer(d, dikirim: e.terkirim))) ?? x;
      g = x.ukurGardu ?? g;
      n++;
    }
    return (p0: x, n: n);
  }

  /// Satu putaran kirim. Hasil: jumlah kiriman berhasil + P0 yang ditolak server (errorKirim, tidak diulang otomatis).
  Future<({int terkirim, int gagal})> kirim(Sesi s, {String installId = ''}) async {
    final shiftId = P0Repository.shiftIdSesi(s);
    if (shiftId == null || !s.petugasYandal) return (terkirim: 0, gagal: 0);
    final akhir = akhirShift(s);
    var ok = 0, gagal = 0;
    final daftar = (await _repo.daftarShift(s.userId, shiftId)).reversed.toList(); // P0 lama dulu
    for (var x in daftar) {
      if (!x.perluKirim(akhirShift: akhir)) continue;
      try {
        if (akhir && x.belumDisimpan.isNotEmpty) x = await _repo.kunciAkhirShift(x);
        if (!x.terkirim || x.lokasiBelumTerkirim) {
          final dikirim = x;
          final d = await _api.call('simpanP0Yandal', token: s.token, data: _data(x, installId, akhir: false));
          x = await _repo.ubahStatusKirim(s.userId, x.id, (k) => k.denganServerData(d, dikirim)) ?? x;
          ok++;
        }
        for (final slot in slotP0) {
          // v0.66.0: switching dikirim sesudah foto Sebelum diterima server, sebelum foto berikutnya (server menolak
          // Sesudah P0 Pengecekan Switching tanpa switching ber-foto arus).
          if (slot != 'SEBELUM' && x.butuhSwitching && (x.foto['SEBELUM']?.terkirim ?? false)) {
            final h = await _kirimSwitching(s, x, installId);
            x = h.p0;
            ok += h.n;
          }
          // v0.74.0: pengukuran gardu sama (Sesudah P0 Pengecekan Gardu ditolak server tanpa 10 foto ukur)
          if (slot != 'SEBELUM' && x.butuhGardu && (x.foto['SEBELUM']?.terkirim ?? false)) {
            final h = await _kirimGardu(s, x, installId);
            x = h.p0;
            ok += h.n;
          }
          final f = x.foto[slot];
          if (f == null || !f.terkunci) break; // urut: foto belum disimpan menahan tahap berikutnya
          if (f.terkirim) continue;
          final file = File(f.path);
          if (!await file.exists()) throw ApiException('FILE_FOTO_HILANG');
          final bytes = await file.readAsBytes();
          final d = await _api.call('uploadFotoP0Yandal', token: s.token, data: {'p0Id': x.id, 'slot': slot, ..._dataFoto(f, bytes)});
          x = await _repo.ubahStatusKirim(s.userId, x.id, (k) => k.denganServer(d)) ?? x;
          ok++;
        }
        if (akhir && !x.finalTerkirim) {
          final d = await _api.call('simpanP0Yandal', token: s.token, data: _data(x, installId, akhir: true));
          x = await _repo.ubahStatusKirim(s.userId, x.id, (k) => k.denganServer(d, finalTerkirim: true)) ?? x;
          ok++;
        }
      } on ApiException catch (e) {
        if (_sementara(e)) rethrow;
        // ditolak server (mis. waktu di luar shift): ditandai, tidak diulang otomatis supaya tidak menahan sync akhir shift
        await _repo.ubahStatusKirim(s.userId, x.id, (k) => k.denganError(e.kode));
        gagal++;
      }
    }
    return (terkirim: ok, gagal: gagal);
  }
}
