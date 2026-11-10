import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';

import '../../core/api_client.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../core/sinkron_atomik.dart';
import '../../core/wib.dart';
import '../hartek/foto_lapangan.dart';
import '../hartek/hartek_store.dart' show GudangHartek, OpHartek, PanggilHartek, HasilKirimHartek, HartekStore;
import 'insjar_lokal.dart';

/// v1.0.0 (permintaan Master Guswan 19 Okt 2026): Inspeksi Jaringan lokal dulu, kirim ke server otomatis (pola HartekStore).
///
/// Penyimpanan memakai tabel yang sama dengan Hartek (hartek_lokal / hartek_antre, kunci user_id): akun tim
/// INSPEKSI_JARINGAN tidak pernah memakai Hartek, jadi data tidak tercampur. Master dropdown: master_cache 'insjar_master'.
/// Antrean: buatHeader > simpanRealisasi > simpanTemuan > uploadFoto, berurutan (FIFO). Data ditolak tetap di HP.
class InsJarStore extends ChangeNotifier {
  InsJarStore(this._gudang, this._panggil,
      {DateTime Function()? jam, Future<List<int>?> Function(String path)? bacaFoto, Future<void> Function(String? path)? hapusFoto})
      : _jam = jam ?? DateTime.now,
        _bacaFoto = bacaFoto ?? FotoLapangan.baca,
        _hapusFoto = hapusFoto ?? FotoLapangan.hapus;

  final GudangHartek _gudang;
  final PanggilHartek _panggil;
  final DateTime Function() _jam;
  final Future<List<int>?> Function(String path) _bacaFoto;
  final Future<void> Function(String? path) _hapusFoto;

  static const _uuid = Uuid();
  static const kunciMaster = 'insjar_master';
  static const umurMaster = Duration(minutes: 30);
  static const menu = 'OPS_INSJAR_INPUT';

  /// Subfolder foto lapangan di folder app ('' = tanpa pembersihan, mis. di test).
  String folderFoto = 'insjar';

  String tanggalIni() => Wib.tanggal(_jam());

  Map<String, dynamic>? _doc;
  String? _kunciDoc;
  Future<void> _rantai = Future<void>.value();

  Future<T> _kunci<T>(Future<T> Function() f) {
    final hasil = _rantai.then((_) => f());
    _rantai = hasil.then<void>((_) {}, onError: (Object _) {});
    return hasil;
  }

  /// v1.0.17 (sinkron atomik): segel laporan hari ini sesudah SEMUA antrean diterima server. Status tersinkron /
  /// tombol WA hanya diberikan kalau segel cocok dengan isi laporan (lihat core/sinkron_atomik.dart).
  late final PenyegelSinkron penyegel = PenyegelSinkron(
      modul: 'INSJAR', endpoint: 'segelSinkronInsJar', baca: _gudang.bacaMaster, tulis: _gudang.tulisMaster, panggil: _panggil)
    ..addListener(notifyListeners);

  /// Segel dipanggil SyncController sesudah kirim + tarik. Antrean hari ini belum kosong = tidak disegel.
  Future<void> segelLaporan(Sesi s) async {
    final tgl = tanggalIni();
    if ((await _gudang.ops(s.userId)).any((o) => o.tanggal == tgl)) return;
    await penyegel.segel(s, tgl, await doc(s));
  }

  /// Tahap sinkron atomik laporan [d] (dokumen hari ini). Segel dimuat dari HP sekali (lalu dari memori).
  TahapSinkron tahapSinkronLaporan(Sesi s, Map<String, dynamic>? d) {
    final tgl = tanggalIni();
    if (penyegel.instan(s.userId, tgl) == null) unawaited(penyegel.muat(s.userId, tgl));
    final n = InsJarLokal.hitung(d);
    return tahapSinkron('INSJAR', doc: d, menunggu: n.menunggu, gagal: n.gagal, segel: penyegel.instan(s.userId, tgl));
  }

  Map<String, dynamic>? docInstan(Sesi s) => _kunciDoc == '${s.userId}|${tanggalIni()}' ? _doc : null;

  Future<Map<String, dynamic>> doc(Sesi s) => _kunci(() => _baca(s.userId, tanggalIni()));

  Future<Map<String, dynamic>> _baca(String userId, String tanggal) async {
    final k = '$userId|$tanggal';
    if (_kunciDoc == k && _doc != null) return _doc!;
    final j = await _gudang.bacaDoc(userId, tanggal);
    Map<String, dynamic> d;
    try {
      d = j == null ? InsJarLokal.kosong(tanggal) : Map<String, dynamic>.from(jsonDecode(j) as Map);
      if (d['realisasi'] is! List) d = InsJarLokal.kosong(tanggal); // bukan dokumen InsJar
    } catch (_) {
      d = InsJarLokal.kosong(tanggal);
    }
    if (tanggal == tanggalIni()) {
      _doc = d;
      _kunciDoc = k;
    }
    return d;
  }

  Future<void> _tulis(String userId, String tanggal, Map<String, dynamic> d) async {
    await _gudang.tulisDoc(userId, tanggal, jsonEncode(d));
    if (tanggal == tanggalIni()) {
      _doc = d;
      _kunciDoc = '$userId|$tanggal';
    }
    notifyListeners();
  }

  Future<Map<String, dynamic>> _ubahDoc(String userId, String tanggal, void Function(Map<String, dynamic> d) f) async {
    final d = InsJarLokal.salin(await _baca(userId, tanggal));
    f(d);
    await _tulis(userId, tanggal, d);
    return d;
  }

  static Map<String, dynamic> _tanpaAkurasi(Map<String, dynamic> isian) => {
        for (final e in isian.entries)
          if (!e.key.startsWith('_akurasi_')) e.key: e.value,
      };

  OpHartek _op(String userId, String tgl, String aksi, String target, Map<String, dynamic> data) =>
      OpHartek(userId: userId, tanggal: tgl, aksi: aksi, target: target, data: data);

  // ---------- tulis lokal (dipanggil form) ----------

  Future<String> buatHeader(Sesi s, Map<String, dynamic> isian) => _kunci(() async {
        final tgl = tanggalIni();
        if ((await _baca(s.userId, tgl))['header'] != null) throw ApiException('LAPORAN_UTAMA_SUDAH_DIBUAT');
        final id = _uuid.v4();
        await _gudang.tambahOp(_op(s.userId, tgl, 'buatHeader', id, {'headerId': id, ..._tanpaAkurasi(isian)}));
        await _ubahDoc(s.userId, tgl, (d) => InsJarLokal.buatHeader(d, {'headerId': id, 'kodeHeader': '', 'revision': 1, ...isian}));
        return id;
      });

  /// Ubah Laporan Utama (header ditolak = kiriman buatHeader diperbaiki).
  Future<void> ubahHeader(Sesi s, Map<String, dynamic> isian) => _kunci(() async {
        final tgl = tanggalIni();
        final h = InsJarLokal.header(await _baca(s.userId, tgl));
        if (h == null) throw ApiException('DATA_TIDAK_DITEMUKAN');
        await _ubahNode(s, tgl, 'buatHeader', 'ubahHeader', '${h['headerId']}', {'headerId': '${h['headerId']}'}, _tanpaAkurasi(isian),
            (d, tandai) => InsJarLokal.ubahIsianHeader(d, isian, tandaiUbah: tandai));
      });

  /// Penyulang utama baru.
  Future<String> tambahRealisasi(Sesi s, Map<String, dynamic> data, Map<String, dynamic> tampil) => _kunci(() async {
        final tgl = tanggalIni();
        final d0 = await _baca(s.userId, tgl);
        final h = InsJarLokal.header(d0);
        if (h == null) throw ApiException('DATA_TIDAK_DITEMUKAN');
        if (InsJarLokal.realisasiGanda(d0, '${data['penyulang'] ?? ''}', '${data['tier'] ?? ''}', '${data['section'] ?? ''}')) {
          throw ApiException('REALISASI_GANDA');
        }
        final id = _uuid.v4();
        await _gudang.tambahOp(_op(s.userId, tgl, 'simpanRealisasi', id, {...data, 'headerId': '${h['headerId']}', 'idBaris': id}));
        await _ubahDoc(s.userId, tgl, (d) => InsJarLokal.tambahRealisasi(d, {...tampil, 'realisasiId': id, 'kodeRealisasi': '', 'revision': 1}));
        return id;
      });

  /// Ubah penyulang utama (tier, section, total tiang, segmen). Penyulang tidak bisa diubah.
  Future<void> ubahRealisasi(Sesi s, String realisasiId, Map<String, dynamic> data, Map<String, dynamic> tampil) =>
      _kunci(() async {
        final tgl = tanggalIni();
        final d0 = await _baca(s.userId, tgl);
        final r = InsJarLokal.realisasi(d0, realisasiId);
        if (r == null) throw ApiException('DATA_TIDAK_DITEMUKAN');
        final tierBaru = data['tier'] != null ? '${data['tier']}' : '${r['tier'] ?? ''}';
        final secBaru = data['section'] != null ? '${data['section']}' : '${r['section'] ?? ''}';
        if ((data['tier'] != null || data['section'] != null) &&
            InsJarLokal.realisasiGanda(d0, '${r['penyulang']}', tierBaru, secBaru, kecuali: realisasiId)) {
          throw ApiException('REALISASI_GANDA');
        }
        await _ubahNode(s, tgl, 'simpanRealisasi', 'ubahRealisasi', realisasiId, {'realisasiId': realisasiId}, data,
            (d, tandai) => InsJarLokal.ubahIsianRealisasi(d, realisasiId, tampil, tandaiUbah: tandai));
      });

  /// Pola bersama ubah: node belum diterima server = antrean pembuatannya diperbaiki; sudah = antrean ubah (digabung).
  /// v1.0.5: [tetap] != null = isian dikirim LENGKAP (temuan): data lama diganti, hanya kunci [tetap] yang dibawa dari
  /// antrean pembuatan, supaya isian yang dikosongkan tidak tertinggal nilai lamanya.
  Future<void> _ubahNode(Sesi s, String tgl, String aksiBuat, String aksiUbah, String id, Map<String, dynamic> kunciData,
      Map<String, dynamic> kirim, void Function(Map<String, dynamic> d, bool tandaiUbah) terapkan, {List<String>? tetap}) async {
    final ops = await _gudang.ops(s.userId);
    final buat = ops.where((o) => o.aksi == aksiBuat && o.target == id).firstOrNull;
    if (buat != null) {
      final lama = buat.data;
      buat
        ..data = tetap == null
            ? {...lama, ...kirim}
            : {
                for (final k in tetap)
                  if (lama.containsKey(k)) k: lama[k],
                ...kirim,
              }
        ..status = OpHartek.menunggu
        ..galat = null;
      await _gudang.ubahOp(buat);
      await _ubahDoc(s.userId, tgl, (d) {
        terapkan(d, false);
        InsJarLokal.tandai(d, id, InsJarLokal.lokal);
      });
      return;
    }
    final ubah = ops.where((o) => o.aksi == aksiUbah && o.target == id).firstOrNull;
    if (ubah != null) {
      ubah
        ..data = tetap == null ? {...ubah.data, ...kirim} : {...kunciData, ...kirim}
        ..status = OpHartek.menunggu
        ..galat = null;
      await _gudang.ubahOp(ubah);
    } else {
      await _gudang.tambahOp(_op(s.userId, tgl, aksiUbah, id, {...kunciData, ...kirim}));
    }
    await _ubahDoc(s.userId, tgl, (d) => terapkan(d, true));
  }

  /// v1.0.5: ubah temuan (isian lengkap form, tanpa foto). Belum diterima server = kiriman simpanTemuan diperbaiki.
  Future<void> ubahTemuan(Sesi s, String temuanId, Map<String, dynamic> data, Map<String, dynamic> tampil) => _kunci(() async {
        final tgl = tanggalIni();
        if (InsJarLokal.temuan(await _baca(s.userId, tgl), temuanId) == null) throw ApiException('DATA_TIDAK_DITEMUKAN');
        await _ubahNode(s, tgl, 'simpanTemuan', 'ubahTemuan', temuanId, {'temuanId': temuanId}, data,
            (d, tandai) => InsJarLokal.ubahIsianTemuan(d, temuanId, tampil, tandaiUbah: tandai),
            tetap: const ['realisasiId', 'idBaris']);
      });

  /// Temuan baru di penyulang utama. [foto] = {TEMUAN / TIANG: path} ikut antre sesudah temuannya.
  Future<String> tambahTemuan(Sesi s, String realisasiId, Map<String, dynamic> data, Map<String, dynamic> tampil,
          {Map<String, String> foto = const {}}) =>
      _kunci(() async {
        final tgl = tanggalIni();
        if (InsJarLokal.realisasi(await _baca(s.userId, tgl), realisasiId) == null) throw ApiException('DATA_TIDAK_DITEMUKAN');
        final id = _uuid.v4();
        await _gudang.tambahOp(_op(s.userId, tgl, 'simpanTemuan', id, {...data, 'realisasiId': realisasiId, 'idBaris': id}));
        final fotoSah = {
          for (final e in foto.entries)
            if (InsJarLokal.slotFoto.contains(e.key) && e.value.isNotEmpty) e.key: e.value,
        };
        for (final e in fotoSah.entries) {
          await _gudang.tambahOp(_opFoto(s.userId, tgl, id, e.key, e.value));
        }
        await _ubahDoc(s.userId, tgl, (d) {
          InsJarLokal.tambahTemuan(d, realisasiId, {...tampil, 'temuanId': id, 'kodeTemuan': '', 'revision': 1});
          for (final e in fotoSah.entries) {
            InsJarLokal.tambahFoto(d, id, e.key, e.value);
          }
        });
        return id;
      });

  OpHartek _opFoto(String userId, String tgl, String temuanId, String slot, String path) => _op(
      userId, tgl, 'uploadFoto', InsJarLokal.targetFoto(temuanId, slot), {'temuanId': temuanId, 'slot': slot, 'path': path});

  /// Foto susulan untuk temuan yang sudah dicatat.
  Future<void> tambahFoto(Sesi s, String temuanId, String slot, String path) => _kunci(() async {
        final tgl = tanggalIni();
        final t = InsJarLokal.temuan(await _baca(s.userId, tgl), temuanId);
        if (t == null || !InsJarLokal.slotFoto.contains(slot)) throw ApiException('DATA_TIDAK_DITEMUKAN');
        final hp = t['fotoLokal'], srv = t['foto'];
        if ((hp is Map && hp[slot] != null) || (srv is Map && srv[slot] != null)) throw ApiException('FOTO_SUDAH_ADA');
        await _gudang.tambahOp(_opFoto(s.userId, tgl, temuanId, slot, path));
        await _ubahDoc(s.userId, tgl, (d) => InsJarLokal.tambahFoto(d, temuanId, slot, path));
      });

  Future<void> cobaUlangFoto(Sesi s, String temuanId, String slot) => _kunci(() async {
        final t = InsJarLokal.targetFoto(temuanId, slot);
        for (final o in await _gudang.ops(s.userId)) {
          if (o.aksi == 'uploadFoto' && o.target == t && o.status == OpHartek.gagal) {
            await _gudang.aturStatusOp(o.id, OpHartek.menunggu, null);
          }
        }
        await _ubahDoc(s.userId, tanggalIni(), (d) => InsJarLokal.tandaiFoto(d, temuanId, slot, InsJarLokal.lokal));
      });

  Future<void> buangFoto(Sesi s, String temuanId, String slot) => _kunci(() async {
        final t = InsJarLokal.targetFoto(temuanId, slot);
        for (final o in await _gudang.ops(s.userId)) {
          if (o.aksi == 'uploadFoto' && o.target == t) await _gudang.hapusOp(o.id);
        }
        String? path;
        await _ubahDoc(s.userId, tanggalIni(), (d) => path = InsJarLokal.buangFoto(d, temuanId, slot));
        await _hapusFoto(path);
      });

  // ---------- ditolak: coba lagi / buang ----------

  /// [ubah] = perubahan (Laporan Utama / penyulang utama) yang ditolak, bukan pembuatannya.
  Future<void> cobaUlang(Sesi s, String id, {bool ubah = false}) => _kunci(() async {
        for (final o in await _gudang.ops(s.userId)) {
          if (o.target != id || o.status != OpHartek.gagal || InsJarLokal.aksiBuat(o.aksi) == ubah) continue;
          await _gudang.aturStatusOp(o.id, OpHartek.menunggu, null);
        }
        await _ubahDoc(s.userId, tanggalIni(), (d) {
          if (ubah) {
            InsJarLokal.tandaiUbah(d, id, InsJarLokal.lokal);
          } else {
            InsJarLokal.tandai(d, id, InsJarLokal.lokal);
          }
        });
      });

  Future<void> buang(Sesi s, String id, {bool ubah = false}) => _kunci(() async {
        final tgl = tanggalIni();
        if (ubah) {
          for (final o in await _gudang.ops(s.userId)) {
            if (o.target == id && !InsJarLokal.aksiBuat(o.aksi) && o.aksi != 'uploadFoto') await _gudang.hapusOp(o.id);
          }
          await _ubahDoc(s.userId, tgl, (d) => InsJarLokal.tandaiUbah(d, id, null));
          return;
        }
        final d0 = await _baca(s.userId, tgl);
        final n = InsJarLokal.cari(d0, id);
        if (n != null && !InsJarLokal.tertunda(n)) return; // sudah di server: tidak dibuang dari HP
        final ids = InsJarLokal.idTurunan(d0, id).toSet();
        final file = <String>[];
        for (final o in await _gudang.ops(s.userId)) {
          if (o.tanggal != tgl) continue;
          final foto = o.aksi == 'uploadFoto' && ids.contains('${o.data['temuanId'] ?? ''}');
          if (foto) file.add('${o.data['path'] ?? ''}');
          if (ids.contains(o.target) || foto) await _gudang.hapusOp(o.id);
        }
        await _ubahDoc(s.userId, tgl, (d) => InsJarLokal.buang(d, id));
        for (final f in file) {
          await _hapusFoto(f);
        }
      });

  Future<int> jumlahTanggalLain(String userId) async {
    final tgl = tanggalIni();
    return (await _gudang.ops(userId)).where((o) => o.tanggal != tgl).length;
  }

  Future<void> buangTanggalLain(Sesi s) => _kunci(() async {
        final tgl = tanggalIni();
        final lama = <String>{};
        for (final o in await _gudang.ops(s.userId)) {
          if (o.tanggal == tgl) continue;
          lama.add(o.tanggal);
          await _gudang.hapusOp(o.id);
          if (o.aksi == 'uploadFoto') await _hapusFoto('${o.data['path'] ?? ''}');
        }
        for (final t in lama) {
          await _gudang.hapusDoc(s.userId, t);
        }
        notifyListeners();
      });

  Future<int> jumlahTertunda(String userId) async => (await _gudang.ops(userId)).length;

  // ---------- kirim ----------

  Future<HasilKirimHartek> kirim(Sesi s) async {
    var terkirim = 0, gagal = 0;
    final percobaan = <int, int>{};
    while (true) {
      final semua = await _kunci(() => _gudang.ops(s.userId));
      final blok = <String>{
        for (final o in semua)
          if (o.status == OpHartek.gagal && InsJarLokal.aksiBuat(o.aksi)) o.target,
      };
      OpHartek? op;
      for (final o in semua) {
        if (o.status != OpHartek.menunggu) continue;
        final induk = InsJarLokal.induk(o.aksi, o.data);
        if ((induk != null && blok.contains(induk)) || (percobaan[o.id] ?? 0) >= 3) {
          if (InsJarLokal.aksiBuat(o.aksi)) blok.add(o.target);
          continue;
        }
        op = o;
        break;
      }
      if (op == null) break;
      percobaan[op.id] = (percobaan[op.id] ?? 0) + 1;
      switch (await _kirimSatu(s, op, percobaan[op.id]!)) {
        case _Hasil.terkirim:
          terkirim++;
        case _Hasil.gagal:
          gagal++;
        case _Hasil.ulang:
          break;
      }
    }
    await _gudang.bersihkan(s.userId, Wib.tanggal(_jam().subtract(const Duration(days: 7))));
    if (folderFoto.isNotEmpty) unawaited(FotoLapangan.bersihkanLama(folderFoto, const Duration(days: 8)));
    return HasilKirimHartek(terkirim, gagal);
  }

  Future<_Hasil> _kirimSatu(Sesi s, OpHartek op, int ke) async {
    if (op.tanggal != tanggalIni()) {
      await _kunci(() => _gagalkan(s, op,
          'Belum terkirim sampai hari berganti. Server hanya menerima laporan hari ini, buang data ini lalu catat ulang bila perlu.'));
      return _Hasil.gagal;
    }
    final snapshot = jsonEncode(op.data);
    final data = Map<String, dynamic>.from(op.data);
    if (InsJarLokal.aksiUbah(op.aksi)) {
      final n = InsJarLokal.cari(await _kunci(() => _baca(s.userId, op.tanggal)), op.target);
      data['revision'] = n != null && n['revision'] is num ? n['revision'] : 1;
    }
    if (op.aksi == 'uploadFoto') {
      final bytes = await _bacaFoto('${op.data['path'] ?? ''}');
      if (bytes == null) {
        await _kunci(() => _gagalkan(s, op, 'File foto tidak ada lagi di HP. Buang foto ini lalu ambil ulang.'));
        return _Hasil.gagal;
      }
      data
        ..remove('path')
        ..addAll(FotoLapangan.isiKirim(bytes));
    }
    try {
      final r = await _panggil(s, InsJarLokal.endpoint[op.aksi]!, data);
      await _kunci(() => _diterima(s, op, r, snapshot));
      return _Hasil.terkirim;
    } on ApiException catch (e) {
      if (KodeError.sesiHabis.contains(e.kode) || HartekStore.putus(e.kode)) rethrow;
      if (op.aksi == 'buatHeader' && e.kode == 'LAPORAN_UTAMA_SUDAH_DIBUAT') {
        final h = (await _panggil(s, 'getInsJarHarian', const {}))['header'];
        if (h is Map && '${h['headerId'] ?? ''}'.isNotEmpty) {
          await _kunci(() => _diterima(s, op, {'headerId': '${h['headerId']}', 'kodeHeader': '${h['kodeHeader'] ?? ''}'}, snapshot));
          return _Hasil.terkirim;
        }
      }
      if (InsJarLokal.aksiUbah(op.aksi) && e.kode == 'KONFLIK_REVISION' && ke < 3) {
        // perangkat lain tim mengubah data: pakai revision terbaru lalu kirim ulang perubahan ini
        final srv = await _panggil(s, 'getInsJarHarian', const {});
        final nSrv = InsJarLokal.cari(srv, op.target);
        if (nSrv != null && nSrv['revision'] is num) {
          await _kunci(() async {
            final d = InsJarLokal.salin(await _baca(s.userId, op.tanggal));
            final n = InsJarLokal.cari(d, op.target);
            if (n != null) n['revision'] = nSrv['revision'];
            await _tulis(s.userId, op.tanggal, d);
          });
          return _Hasil.ulang;
        }
      }
      await _kunci(() => _gagalkan(s, op, pesanInsJar(e.kode)));
      return _Hasil.gagal;
    }
  }

  Future<void> _diterima(Sesi s, OpHartek op, Map<String, dynamic> r, String snapshot) async {
    final d = InsJarLokal.salin(await _baca(s.userId, op.tanggal));
    switch (op.aksi) {
      case 'buatHeader':
        final baru = '${r['headerId'] ?? ''}'.isEmpty ? op.target : '${r['headerId']}';
        if (baru != op.target) {
          // digabung ke Laporan Utama tim dari perangkat lain: antrean ikut ID header server
          InsJarLokal.gantiHeaderId(d, op.target, baru, '${r['kodeHeader'] ?? ''}');
          for (final o in await _gudang.ops(s.userId)) {
            var ubah = false;
            if (o.target == op.target) {
              o.target = baru;
              ubah = true;
            }
            if ('${o.data['headerId'] ?? ''}' == op.target) {
              o.data = {...o.data, 'headerId': baru};
              ubah = true;
            }
            if (ubah) await _gudang.ubahOp(o);
          }
        } else {
          InsJarLokal.diterima(d, op.aksi, op.target, r);
        }
      case 'ubahHeader':
      case 'ubahRealisasi':
      case 'ubahTemuan':
        final n = InsJarLokal.cari(d, op.target);
        if (n != null && r['revision'] != null) n['revision'] = r['revision'];
      case 'uploadFoto':
        InsJarLokal.tandaiFoto(d, '${op.data['temuanId']}', '${op.data['slot']}', null, link: '${r['link'] ?? ''}');
        // v1.0.5: foto menaikkan revision temuan di server
        final tf = InsJarLokal.temuan(d, '${op.data['temuanId']}');
        if (tf != null && r['revision'] is num) tf['revision'] = r['revision'];
      default:
        InsJarLokal.diterima(d, op.aksi, op.target, r);
        if (op.aksi == 'simpanTemuan' && r['revision'] is num) {
          final tb = InsJarLokal.temuan(d, op.target);
          if (tb != null) tb['revision'] = r['revision'];
        }
        if (op.aksi == 'simpanTemuan' && r['jumlahTemuan'] is num) {
          final real = InsJarLokal.realisasi(d, '${op.data['realisasiId']}');
          if (real != null) real['jumlahTemuan'] = r['jumlahTemuan'];
        }
    }
    final kini = (await _gudang.ops(s.userId)).where((o) => o.id == op.id).firstOrNull;
    final aksiUbah = InsJarLokal.aksiUbah(op.aksi);
    final berubah = kini != null && aksiUbah && jsonEncode(kini.data) != snapshot;
    if (kini != null && !berubah) await _gudang.hapusOp(op.id);
    if (aksiUbah && !berubah) InsJarLokal.tandaiUbah(d, op.target, null);
    await _tulis(s.userId, op.tanggal, d);
  }

  Future<void> _gagalkan(Sesi s, OpHartek op, String pesan) async {
    await _gudang.aturStatusOp(op.id, OpHartek.gagal, pesan);
    await _ubahDoc(s.userId, op.tanggal, (d) {
      if (op.aksi == 'uploadFoto') {
        InsJarLokal.tandaiFoto(d, '${op.data['temuanId']}', '${op.data['slot']}', InsJarLokal.gagal, pesan: pesan);
      } else if (InsJarLokal.aksiUbah(op.aksi)) {
        InsJarLokal.tandaiUbah(d, op.target, InsJarLokal.gagal, pesan: pesan);
      } else {
        InsJarLokal.tandai(d, op.target, InsJarLokal.gagal, pesan: pesan);
      }
    });
  }

  Future<void> tarik(Sesi s) async {
    final srv = await _panggil(s, 'getInsJarHarian', const {});
    final tgl = '${srv['tanggal'] ?? ''}';
    if (tgl != tanggalIni()) return;
    await _kunci(() async {
      final d = await _baca(s.userId, tgl);
      await _tulis(s.userId, tgl, InsJarLokal.gabung(d, srv));
    });
  }

  // ---------- master ----------

  /// Dropdown form: dari HP kalau ada, diperbarui di latar kalau lebih dari 30 menit. Belum ada = unduh sekarang.
  Future<Map<String, dynamic>> master(Sesi s) async {
    final ada = await _gudang.bacaMaster(kunciMaster);
    if (ada != null) {
      if (_jam().difference(ada.diambil) > umurMaster) unawaited(_unduhMaster(s).then<void>((_) {}, onError: (Object _) {}));
      return Map<String, dynamic>.from(jsonDecode(ada.json) as Map);
    }
    return _unduhMaster(s);
  }

  Future<Map<String, dynamic>> _unduhMaster(Sesi s) async {
    final r = await _panggil(s, 'getMasterInsJar', const {});
    await _gudang.tulisMaster(kunciMaster, jsonEncode(r));
    return r;
  }

  Future<void> segarkanMaster(Sesi s, {bool paksa = false}) async {
    final ada = await _gudang.bacaMaster(kunciMaster);
    if (paksa || ada == null || _jam().difference(ada.diambil) > umurMaster) await _unduhMaster(s);
  }
}

enum _Hasil { terkirim, gagal, ulang }

String pesanInsJar(String kode) {
  switch (kode) {
    case 'LAPORAN_UTAMA_SUDAH_DIBUAT':
      return 'Laporan Utama telah dibuat. Buka laporan yang sudah ada.';
    case 'KONFLIK_REVISION':
      return 'Data telah diubah perangkat lain. Segarkan laporan sebelum mengubahnya.';
    case 'KM_AKHIR_KURANG':
      return 'KM akhir tidak boleh lebih kecil dari KM awal.';
    case 'PENYULANG_TIDAK_VALID':
      return 'Pilih penyulang yang aktif dari daftar.';
    case 'SECTION_TIDAK_VALID':
      return 'Pilih section yang sesuai dengan penyulang.';
    case 'REALISASI_GANDA':
      return 'Penyulang, tier, dan section ini sudah ada di laporan hari ini.';
    case 'SECTION_TERKUNCI':
      return 'Section tidak bisa diubah karena sudah ada temuan.';
    case 'JENIS_TEMUAN_TIDAK_VALID':
      return 'Jenis temuan tidak aktif atau tidak ada di db_Jenis_Temuan. Pilih dari daftar.';
    case 'TANGGAL_DI_LUAR_BATAS':
      return 'Tanggal di luar batas (hari ini sampai 31 hari ke belakang).';
    case 'FOTO_SUDAH_ADA':
      return 'Foto ini sudah ada.';
    case 'FOTO_RUSAK':
      return 'Foto rusak saat dikirim. Coba lagi.';
    case 'FOTO_TERLALU_BESAR':
      return 'Foto lebih dari 2 MB. Ambil ulang.';
    default:
      return KodeError.pesan(kode);
  }
}
