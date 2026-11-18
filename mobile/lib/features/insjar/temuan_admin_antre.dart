import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../../core/api_client.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../c4a/c4a_model.dart';
import '../hartek/foto_lapangan.dart';
import '../hartek/hartek_store.dart' show GudangHartek;
import 'insjar_store.dart' show pesanInsJar;
import 'temuan_offline.dart';

/// v1.0.29 (permintaan Master Guswan 24 Okt 2026): temuan inspeksi yang diinput admin (menu Temuan Inspeksi) tidak lagi menunggu
/// server. Simpan = form langsung tertutup, temuan masuk daftar HP dan antrean ini, lalu dikirim di latar
/// (simpanTemuanInspeksi, lalu uploadFotoTemuanInspeksi per foto). Tidak ada chip / pesan kirim.
///
/// Antrean disimpan di HP (master_cache, per akun), jadi tetap terkirim sesudah app ditutup atau sinyal putus: dikirim lagi
/// oleh SyncController (app dibuka, tiap 5 menit, sinyal pulih). idBaris dibuat sekali per temuan, jadi kirim ulang =
/// duplikat di server, bukan baris kembar (temuanId = idBaris). Foto susulan dari kartu temuan memakai antrean yang sama.
///
/// Satu item: {idBaris, temuanId, kodeTemuan, data (null = sudah diterima server / foto susulan saja), tanggal, tampil (node
/// kartu, dipasang lagi ke daftar HP sesudah unduh ulang selama belum diterima server), foto: {SLOT: path}, galat}.
/// [galat] terisi = ditolak server (bukan sinyal): berhenti sampai admin memilih Kirim ulang / Buang di kartu temuan.
class AntreanTemuanAdmin extends ChangeNotifier {
  AntreanTemuanAdmin(this._gudang, this._api, {Future<List<int>?> Function(String path)? bacaFoto, Future<void> Function(String? path)? hapusFoto})
      : _bacaFoto = bacaFoto ?? FotoLapangan.baca,
        _hapusFoto = hapusFoto ?? FotoLapangan.hapus;

  final GudangHartek _gudang;
  final Future<Map<String, dynamic>> Function(Sesi s, String aksi, Map<String, dynamic> data) _api;
  final Future<List<int>?> Function(String path) _bacaFoto;
  final Future<void> Function(String? path) _hapusFoto;

  static const menu = 'OPS_INPUT_TEMUAN';
  static const folderFoto = 'temuan_admin';

  static String kunci(String userId) => 'antre_temuan_admin_$userId';

  /// Salinan antrean terakhir yang dibaca / ditulis (untuk kartu temuan, tanpa menunggu baca HP).
  List<Map<String, dynamic>> _item = const [];
  String? _userItem;
  bool _jalan = false;
  Future<void> _rantai = Future<void>.value();

  static String _t(Object? v) => v?.toString().trim() ?? '';

  /// Kerja baca-ubah-tulis berurutan (tambah dari layar dan kirim di latar tidak saling menimpa).
  Future<T> _kunci<T>(Future<T> Function() f) {
    final hasil = _rantai.then((_) => f());
    _rantai = hasil.then((_) {}, onError: (Object _) {});
    return hasil;
  }

  Future<List<Map<String, dynamic>>> _baca(String userId) async {
    try {
      final r = await _gudang.bacaMaster(kunci(userId));
      final l = r == null ? const <dynamic>[] : (jsonDecode(r.json) as List<dynamic>);
      return [for (final x in l) if (x is Map) Map<String, dynamic>.from(x)];
    } catch (_) {
      return [];
    }
  }

  Future<void> _tulis(String userId, List<Map<String, dynamic>> l) async {
    await _gudang.tulisMaster(kunci(userId), jsonEncode(l));
    _item = l;
    _userItem = userId;
    notifyListeners();
  }

  /// Antrean akun [userId] (dibaca dari HP sekali, lalu dari salinan).
  Future<List<Map<String, dynamic>>> daftar(String userId) => _kunci(() async {
        if (_userItem != userId) {
          _item = await _baca(userId);
          _userItem = userId;
        }
        return _item;
      });

  /// Entri antrean akun [userId] yang masih akan dikirim (yang ditolak server tidak dihitung: menunggu Kirim ulang / Buang).
  /// Dihitung SyncController sebagai "data belum terkirim" supaya layanan latar hidup saat app ditutup tanpa force close.
  Future<int> jumlahTertunda(String userId) async =>
      (await daftar(userId)).where((x) => _t(x['galat']).isEmpty).length;

  /// Item antrean untuk temuan [temuanId] (null = sudah terkirim semua / bukan antrean akun ini).
  Map<String, dynamic>? item(String userId, String temuanId) {
    if (_userItem != userId) return null;
    for (final x in _item) {
      if (_t(x['temuanId']) == temuanId) return x;
    }
    return null;
  }

  /// Temuan baru dari form admin. [data] = isian simpanTemuanInspeksi (tanpa tanggal / idBaris), [tampil] = node kartu.
  Future<void> tambahTemuan(Sesi s,
          {required String idBaris,
          required Map<String, dynamic> data,
          required Map<String, dynamic> tampil,
          required String tanggal,
          required Map<String, String> foto}) =>
      _kunci(() async {
        final l = [...await _baca(s.userId)]..removeWhere((x) => _t(x['idBaris']) == idBaris);
        l.add({
          'idBaris': idBaris, 'temuanId': idBaris, 'kodeTemuan': '', 'data': data, 'tampil': tampil, 'tanggal': tanggal, 'foto': foto, 'galat': ''
        });
        await _tulis(s.userId, l);
      });

  /* ===== C4A (permintaan Master Guswan 15 Nov 2026): Laporan C4A ikut antrean yang sama ===== */
  // Item laporan: {jenis: C4A_BUKA | C4A_TUTUP, idBaris, temuanId (bukan id temuan), c4aId, data, galat}. Item tanpa jenis = temuan.
  // Urutan antrean = urutan kirim: BUKA, temuan laporan itu, TUTUP.

  static String kunciAktif(String userId) => 'c4a_aktif_$userId';

  /// Master form temuan (penyulang + section + jenis temuan) di HP, dipakai form C4A saat sinyal lemah.
  static String kunciMaster(String userId) => 'master_temuan_inspeksi_$userId';
  DateTime? _masterSegar;

  /// Unduh master form temuan di latar (dipanggil sinkron: app dibuka, tiap 5 menit, sinyal pulih) supaya penyulang + section tetap
  /// bisa dipilih saat sinyal lemah, tanpa harus membuka layar C4A dulu. Ulang paling cepat tiap 6 jam; gagal = simpanan lama dipakai.
  Future<void> segarkanMaster(Sesi s) async {
    if (!s.bisaUbah(menu)) return;
    final segar = _masterSegar;
    if (segar != null && DateTime.now().difference(segar) < const Duration(hours: 6)) return;
    try {
      final r = await _api(s, 'getMasterTemuanInspeksi', const {});
      await _gudang.tulisMaster(kunciMaster(s.userId), jsonEncode(r));
      _masterSegar = DateTime.now();
    } catch (_) {
      // tanpa sinyal: simpanan lama tetap dipakai, dicoba lagi sinkron berikutnya
    }
  }

  /// Laporan C4A aktif akun ini (TERBUKA dan dibuat [hariIni]), atau null.
  Future<LaporanC4A?> laporanAktif(String userId, String hariIni) async {
    final r = await _gudang.bacaMaster(kunciAktif(userId));
    if (r == null || r.json == 'null') return null;
    try {
      final l = LaporanC4A.fromJson(Map<String, dynamic>.from(jsonDecode(r.json) as Map));
      return l.terbukaHariIni(hariIni) ? l : null;
    } catch (_) {
      return null;
    }
  }

  Future<void> _tulisAktif(String userId, LaporanC4A? l) async {
    await _gudang.tulisMaster(kunciAktif(userId), jsonEncode(l?.toJson()));
    notifyListeners();
  }

  /// Laporan baru: simpan sebagai laporan aktif + antre buatLaporanC4A.
  Future<void> bukaLaporan(Sesi s, LaporanC4A l) => _kunci(() async {
        await _tulisAktif(s.userId, l);
        final daftar = [
          ...await _baca(s.userId),
          {'jenis': 'C4A_BUKA', 'idBaris': 'c4a:${l.c4aId}', 'temuanId': 'c4a:${l.c4aId}', 'c4aId': l.c4aId, 'data': l.isiBuat(), 'galat': ''},
        ];
        await _tulis(s.userId, daftar);
      });

  /// Riwayat tab Laporan C4A (permintaan Master Guswan 15 Nov 2026): laporan akun yang sudah ditutup, terbaru dulu.
  static String kunciRiwayat(String userId) => 'c4a_riwayat_$userId';

  Future<List<LaporanC4A>> _bacaRiwayat(String userId) async {
    try {
      final r = await _gudang.bacaMaster(kunciRiwayat(userId));
      final l = r == null ? const <dynamic>[] : (jsonDecode(r.json) as List<dynamic>);
      return [for (final x in l) if (x is Map) LaporanC4A.fromJson(Map<String, dynamic>.from(x))];
    } catch (_) {
      return [];
    }
  }

  /// Disimpan hanya laporan [hariIni] (hari lalu ada di tab Arsip C4A).
  Future<void> _tulisRiwayat(String userId, String hariIni, List<LaporanC4A> l) async {
    await _gudang.tulisMaster(kunciRiwayat(userId), jsonEncode([for (final x in l) if (x.tanggal == hariIni) x.toJson()]));
    notifyListeners();
  }

  /// Laporan yang sudah ditutup hari [hariIni].
  Future<List<LaporanC4A>> riwayat(String userId, String hariIni) async =>
      [for (final l in await _bacaRiwayat(userId)) if (l.tanggal == hariIni) l];

  /// Riwayat dari server (getLaporanC4A) menimpa salinan HP per c4aId; laporan yang belum sampai server tetap tampil.
  Future<void> gabungRiwayat(String userId, String hariIni, List<LaporanC4A> server) => _kunci(() async {
        final peta = {for (final l in server) l.c4aId: l};
        final lokal = await riwayat(userId, hariIni);
        final ada = {for (final l in lokal) l.c4aId};
        await _tulisRiwayat(userId, hariIni, [for (final l in lokal) peta[l.c4aId] ?? l, for (final l in server) if (!ada.contains(l.c4aId)) l]);
      });

  /// Titik akhir: laporan tidak aktif lagi, masuk riwayat hari itu + antre tutupLaporanC4A.
  Future<void> tutupLaporan(Sesi s, LaporanC4A laporan, double lat, double lng, String sumber) => _kunci(() async {
        final c4aId = laporan.c4aId;
        await _tulisAktif(s.userId, null);
        await _tulisRiwayat(s.userId, laporan.tanggal,
            [laporan.selesai(lat, lng), for (final l in await _bacaRiwayat(s.userId)) if (l.c4aId != c4aId) l]);
        final daftar = [
          ...await _baca(s.userId),
          {
            'jenis': 'C4A_TUTUP', 'idBaris': 'c4a-tutup:$c4aId', 'temuanId': 'c4a-tutup:$c4aId', 'c4aId': c4aId,
            'data': {'c4aId': c4aId, 'koordinatAkhir': '$lat, $lng', 'sumberAkhir': sumber}, 'galat': ''
          },
        ];
        await _tulis(s.userId, daftar);
      });

  /// Server menolak laporan HP ini (akun sudah punya laporan terbuka): temuan dipindah ke laporan server,
  /// item BUKA + TUTUP laporan lokal dibuang, laporan aktif = laporan server.
  Future<void> _pindahKeLaporanServer(String userId, String c4aLama, Map<String, dynamic> laporan) async {
    final baru = LaporanC4A.fromJson(laporan);
    final l = [...await _baca(userId)]..removeWhere((y) => _t(y['c4aId']) == c4aLama && _t(y['jenis']).startsWith('C4A_'));
    for (final y in l) {
      final d = y['data'];
      if (y['jenis'] == null && d is Map && _t(d['c4aId']) == c4aLama) y['data'] = {...Map<String, dynamic>.from(d), 'c4aId': baru.c4aId};
    }
    await _tulis(userId, l);
    await _tulisAktif(userId, baru);
    await _tulisRiwayat(userId, baru.tanggal, [for (final r in await _bacaRiwayat(userId)) if (r.c4aId != c4aLama) r]);
  }

  /// Kirim satu item laporan (BUKA / TUTUP). Diterima = item keluar dari antrean (true); ditolak C4A_SUDAH_ADA = false.
  Future<bool> _kirimLaporan(Sesi s, Map<String, dynamic> x) async {
    final c4aId = _t(x['c4aId']);
    final buka = x['jenis'] == 'C4A_BUKA';
    final r = await _api(s, buka ? 'buatLaporanC4A' : 'tutupLaporanC4A', Map<String, dynamic>.from(x['data'] as Map));
    return _kunci(() async {
      if (buka && r['ditolak'] == 'C4A_SUDAH_ADA' && r['laporan'] is Map) {
        await _pindahKeLaporanServer(s.userId, c4aId, Map<String, dynamic>.from(r['laporan'] as Map));
        return false;
      }
      final l = [...await _baca(s.userId)]..removeWhere((y) => _t(y['idBaris']) == _t(x['idBaris']));
      await _tulis(s.userId, l);
      return true;
    });
  }

  /// Temuan yang belum diterima server (node kartu), untuk dipasang lagi ke daftar sesudah unduh ulang dari server.
  List<Map<String, dynamic>> belumDiServer(String userId) => [
        if (_userItem == userId)
          for (final x in _item)
            if (x['data'] is Map && x['tampil'] is Map) Map<String, dynamic>.from(x['tampil'] as Map),
      ];

  /// Foto susulan (kartu temuan yang sudah ada di server). Foto lama slot itu yang belum terkirim diganti.
  Future<void> tambahFoto(Sesi s, String temuanId, String kodeTemuan, String slot, String path) => _kunci(() async {
        final l = [...await _baca(s.userId)];
        var x = l.where((y) => _t(y['temuanId']) == temuanId).firstOrNull;
        if (x == null) {
          x = {'idBaris': temuanId, 'temuanId': temuanId, 'kodeTemuan': kodeTemuan, 'data': null, 'tanggal': '', 'foto': <String, String>{}, 'galat': ''};
          l.add(x);
        }
        final f = Map<String, String>.from(x['foto'] as Map? ?? const {});
        final lama = f[slot];
        f[slot] = path;
        x['foto'] = f;
        x['galat'] = '';
        await _tulis(s.userId, l);
        if (lama != null && lama != path) await _hapusFoto(lama);
      });

  /// Ditolak server: kirim lagi (galat dihapus).
  Future<void> kirimUlang(Sesi s, String temuanId) => _kunci(() async {
        final l = [...await _baca(s.userId)];
        for (final x in l) {
          if (_t(x['temuanId']) == temuanId) x['galat'] = '';
        }
        await _tulis(s.userId, l);
      });

  /// Buang dari antrean. [slot] diisi = hanya foto itu; temuan yang belum diterima server ikut keluar dari daftar HP.
  Future<void> buang(Sesi s, String temuanId, {String? slot}) => _kunci(() async {
        final l = [...await _baca(s.userId)];
        final x = l.where((y) => _t(y['temuanId']) == temuanId).firstOrNull;
        if (x == null) return;
        final f = Map<String, String>.from(x['foto'] as Map? ?? const {});
        final buangFoto = slot == null ? f.values.toList() : [if (f[slot] != null) f[slot]!];
        if (slot != null) f.remove(slot);
        if (slot == null || (f.isEmpty && x['data'] == null)) {
          l.remove(x);
          if (slot == null && x['data'] != null) await _hapusDariDaftar(s.userId, temuanId);
        } else {
          x['foto'] = f;
          x['galat'] = '';
        }
        await _tulis(s.userId, l);
        for (final p in buangFoto) {
          await _hapusFoto(p);
        }
      });

  Future<void> _hapusDariDaftar(String userId, String temuanId) async {
    final simpanan = SimpananTemuanOffline(_gudang);
    final isi = await simpanan.baca(userId);
    if (isi == null) return;
    await simpanan.tulis(userId, {
      ...isi,
      'temuan': [
        for (final t in (isi['temuan'] as List<dynamic>? ?? const <dynamic>[]))
          if (t is Map && _t(t['temuanId']) != temuanId) t,
      ],
    });
  }

  /// Kode temuan dari server masuk ke daftar temuan HP (kartu tidak lagi "menunggu kirim").
  Future<void> _kodeKeDaftar(String userId, String temuanId, String kode) async {
    final simpanan = SimpananTemuanOffline(_gudang);
    final isi = await simpanan.baca(userId);
    if (isi == null) return;
    await simpanan.tulis(userId, {
      ...isi,
      'temuan': [
        for (final t in (isi['temuan'] as List<dynamic>? ?? const <dynamic>[]))
          if (t is Map && _t(t['temuanId']) == temuanId) {...Map<String, dynamic>.from(t), 'kodeTemuan': kode} else t,
      ],
    });
  }

  static bool _sinyal(String kode) => kode.startsWith('HTTP_') || kode == KodeError.serverSibuk || KodeError.sesiHabis.contains(kode);

  /// Kirim semua item yang tidak ditolak. Galat sinyal / sesi = berhenti (dicoba lagi di sinkron berikutnya).
  /// Hasil: jumlah item yang selesai terkirim. Aman dipanggil berkali-kali (tidak dobel jalan).
  Future<int> kirim(Sesi s) async {
    if (_jalan || !s.bisaUbah(menu)) return 0;
    _jalan = true;
    var selesai = 0;
    try {
      while (true) {
        final x = (await daftar(s.userId)).where((y) => _t(y['galat']).isEmpty).firstOrNull;
        if (x == null) break;
        final id = _t(x['temuanId']);
        try {
          if (_t(x['jenis']).startsWith('C4A_')) {
            if (await _kirimLaporan(s, x)) selesai++;
            continue;
          }
          if (x['data'] is Map) {
            final r = await _api(s, 'simpanTemuanInspeksi',
                {...Map<String, dynamic>.from(x['data'] as Map), 'tanggal': _t(x['tanggal']), 'idBaris': _t(x['idBaris'])});
            final kode = _t(r['kodeTemuan']);
            await _kunci(() async {
              final l = [...await _baca(s.userId)];
              for (final y in l) {
                if (_t(y['temuanId']) != id) continue;
                y
                  ..['data'] = null
                  ..['tampil'] = null
                  ..['kodeTemuan'] = kode;
              }
              await _kodeKeDaftar(s.userId, id, kode);
              await _tulis(s.userId, l);
            });
          }
          final foto = Map<String, String>.from(x['foto'] as Map? ?? const {});
          for (final e in foto.entries) {
            final bytes = await _bacaFoto(e.value);
            if (bytes != null) {
              await _api(s, 'uploadFotoTemuanInspeksi', {'temuanId': id, 'slot': e.key, ...FotoLapangan.isiKirim(bytes)});
            }
            await _kunci(() async {
              final l = [...await _baca(s.userId)];
              for (final y in l) {
                if (_t(y['temuanId']) != id) continue;
                final f = Map<String, String>.from(y['foto'] as Map? ?? const {});
                if (f[e.key] == e.value) f.remove(e.key);
                y['foto'] = f;
              }
              await _tulis(s.userId, l);
            });
            await _hapusFoto(e.value); // sudah di Drive (atau file hilang), salinan HP tidak diperlukan
          }
          await _kunci(() async {
            final l = [...await _baca(s.userId)]
              ..removeWhere((y) => _t(y['temuanId']) == id && y['data'] is! Map && (y['foto'] as Map? ?? const {}).isEmpty);
            await _tulis(s.userId, l);
          });
          selesai++;
        } on ApiException catch (e) {
          if (_sinyal(e.kode)) rethrow;
          await _kunci(() async {
            final l = [...await _baca(s.userId)];
            for (final y in l) {
              if (_t(y['temuanId']) == id) y['galat'] = pesanInsJar(e.kode);
            }
            await _tulis(s.userId, l);
          });
        }
      }
    } on ApiException {
      // sinyal / sesi: antrean tetap di HP
    } catch (_) {
      // offline: antrean tetap di HP
    } finally {
      _jalan = false;
    }
    return selesai;
  }
}
