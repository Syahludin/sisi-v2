import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:sqflite/sqflite.dart';
import 'package:uuid/uuid.dart';

import '../../core/api_client.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../core/sinkron_atomik.dart';
import '../../core/wib.dart';
import '../../data/local_db.dart';
import 'foto_lapangan.dart';
import 'hartek_form.dart' show pesanHartek;
import 'hartek_lokal.dart';

/// v0.95.0 (permintaan Master Guswan 14 Okt 2026): Hartek lokal dulu, kirim ke server otomatis.
///
/// Layar SELALU membaca laporan dari HP (tanpa menunggu server), simpan = tulis lokal + masuk antrean.
/// Antrean dikirim berurutan (FIFO) oleh SyncController: saat app dibuka, tiap 5 menit, dan setelah data disimpan.
/// Data yang ditolak server tetap di HP dengan alasannya (coba lagi / buang), anaknya menunggu.
class OpHartek {
  OpHartek({
    this.id = 0,
    required this.userId,
    required this.tanggal,
    required this.aksi,
    required this.target,
    required this.data,
    this.status = menunggu,
    this.galat,
  });

  static const menunggu = 'MENUNGGU', gagal = 'GAGAL';

  int id;
  final String userId, tanggal;
  String aksi, target;
  Map<String, dynamic> data;
  String status;
  String? galat;
}

/// Penyimpanan Hartek di HP. Dipisah supaya antrean bisa diuji tanpa sqflite (lihat hartek_store_test.dart).
abstract class GudangHartek {
  Future<String?> bacaDoc(String userId, String tanggal);
  Future<void> tulisDoc(String userId, String tanggal, String json);
  Future<void> hapusDoc(String userId, String tanggal);
  Future<List<OpHartek>> ops(String userId);
  Future<int> tambahOp(OpHartek op);
  Future<void> ubahOp(OpHartek op);
  Future<void> aturStatusOp(int id, String status, String? galat);
  Future<void> hapusOp(int id);

  /// Dokumen lama (sebelum [sebelumTanggal]) tanpa antrean dihapus.
  Future<void> bersihkan(String userId, String sebelumTanggal);
  Future<({String json, DateTime diambil})?> bacaMaster(String kunci);
  Future<void> tulisMaster(String kunci, String json);
}

class GudangHartekSql implements GudangHartek {
  /// v1.0.16: [tabelDoc] / [tabelAntre] = tabel lain berstruktur sama (WO tindak lanjut: wo_lokal / wo_antre).
  GudangHartekSql(this._db, {this.tabelDoc = 'hartek_lokal', this.tabelAntre = 'hartek_antre'});
  final LocalDb _db;
  final String tabelDoc, tabelAntre;
  Database get _d => _db.db;

  static String _kini() => DateTime.now().toUtc().toIso8601String();

  @override
  Future<String?> bacaDoc(String userId, String tanggal) async {
    final r = await _d.query(tabelDoc, where: 'user_id = ? AND tanggal = ?', whereArgs: [userId, tanggal], limit: 1);
    return r.isEmpty ? null : r.first['json'] as String;
  }

  @override
  Future<void> tulisDoc(String userId, String tanggal, String json) => _d.insert(
      tabelDoc, {'user_id': userId, 'tanggal': tanggal, 'json': json, 'diubah_pada': _kini()},
      conflictAlgorithm: ConflictAlgorithm.replace);

  @override
  Future<void> hapusDoc(String userId, String tanggal) =>
      _d.delete(tabelDoc, where: 'user_id = ? AND tanggal = ?', whereArgs: [userId, tanggal]);

  @override
  Future<List<OpHartek>> ops(String userId) async {
    final r = await _d.query(tabelAntre, where: 'user_id = ?', whereArgs: [userId], orderBy: 'id');
    return [
      for (final x in r)
        OpHartek(
          id: x['id'] as int,
          userId: x['user_id'] as String,
          tanggal: x['tanggal'] as String,
          aksi: x['aksi'] as String,
          target: x['target'] as String,
          data: Map<String, dynamic>.from(jsonDecode(x['data'] as String) as Map),
          status: x['status'] as String,
          galat: x['galat'] as String?,
        ),
    ];
  }

  @override
  Future<int> tambahOp(OpHartek op) => _d.insert(tabelAntre, {
        'user_id': op.userId,
        'tanggal': op.tanggal,
        'aksi': op.aksi,
        'target': op.target,
        'data': jsonEncode(op.data),
        'status': op.status,
        'galat': op.galat,
        'dibuat_pada': _kini(),
      });

  @override
  Future<void> ubahOp(OpHartek op) => _d.update(
      tabelAntre, {'aksi': op.aksi, 'target': op.target, 'data': jsonEncode(op.data), 'status': op.status, 'galat': op.galat},
      where: 'id = ?', whereArgs: [op.id]);

  @override
  Future<void> aturStatusOp(int id, String status, String? galat) =>
      _d.update(tabelAntre, {'status': status, 'galat': galat}, where: 'id = ?', whereArgs: [id]);

  @override
  Future<void> hapusOp(int id) => _d.delete(tabelAntre, where: 'id = ?', whereArgs: [id]);

  @override
  Future<void> bersihkan(String userId, String sebelumTanggal) => _d.delete(tabelDoc,
      where: 'user_id = ? AND tanggal < ? AND tanggal NOT IN (SELECT tanggal FROM $tabelAntre WHERE user_id = ?)',
      whereArgs: [userId, sebelumTanggal, userId]);

  @override
  Future<({String json, DateTime diambil})?> bacaMaster(String kunci) async {
    final r = await _d.query('master_cache', where: 'kunci = ?', whereArgs: [kunci], limit: 1);
    if (r.isEmpty) return null;
    return (json: r.first['json'] as String, diambil: DateTime.tryParse(r.first['diambil_pada'] as String) ?? DateTime(2000));
  }

  @override
  Future<void> tulisMaster(String kunci, String json) => _d.insert(
      'master_cache', {'kunci': kunci, 'versi': '-', 'json': json, 'diambil_pada': _kini()},
      conflictAlgorithm: ConflictAlgorithm.replace);
}

/// Pemanggil server (token sesi). Di app = ApiClient.call, di test = server palsu.
typedef PanggilHartek = Future<Map<String, dynamic>> Function(Sesi s, String aksi, Map<String, dynamic> data);

class HasilKirimHartek {
  const HasilKirimHartek(this.terkirim, this.gagal);
  final int terkirim, gagal;
}

class HartekStore extends ChangeNotifier {
  HartekStore(this._gudang, this._panggil,
      {DateTime Function()? jam,
      Future<void> Function(Sesi s)? siapkanGardu,
      Future<List<int>?> Function(String path)? bacaFoto,
      Future<void> Function(String? path)? hapusFoto})
      : _jam = jam ?? DateTime.now,
        _siapkanGardu = siapkanGardu,
        _bacaFoto = bacaFoto ?? FotoLapangan.baca,
        _hapusFoto = hapusFoto ?? FotoLapangan.hapus;

  final GudangHartek _gudang;
  final PanggilHartek _panggil;
  final DateTime Function() _jam;
  final Future<void> Function(Sesi s)? _siapkanGardu;

  /// v1.0.0: baca / hapus file foto lapangan (di test diganti memori).
  final Future<List<int>?> Function(String path) _bacaFoto;
  final Future<void> Function(String? path) _hapusFoto;

  static const _uuid = Uuid();

  /// v1.0.0: subfolder foto lapangan di folder app ('' = tanpa pembersihan, mis. di test).
  String folderFoto = 'hartek';
  static const umurMaster = Duration(minutes: 30);
  static const endpointMaster = {
    'jaringan': 'getJaringanHartek',
    'jenis': 'getJenisPekerjaanHartek',
    'material': 'getMaterialHartek',
  };

  /// Kode yang berarti jaringan / server bermasalah (bukan data ditolak): berhenti, coba lagi nanti.
  static bool putus(String kode) =>
      kode.startsWith('HTTP_') ||
      const {'RESPON_BUKAN_JSON', 'RESPON_TIDAK_VALID', 'ENV_TIDAK_COCOK', 'REDIRECT_TIDAK_DIIZINKAN', KodeError.serverSibuk,
              KodeError.terlaluSering}
          .contains(kode);

  String tanggalIni() => Wib.tanggal(_jam());

  Map<String, dynamic>? _doc;
  String? _kunciDoc;
  Future<void> _rantai = Future<void>.value();

  /// Semua baca-tulis dokumen + antrean berurutan (tidak ada dua penulisan bersamaan).
  Future<T> _kunci<T>(Future<T> Function() f) {
    final hasil = _rantai.then((_) => f());
    _rantai = hasil.then<void>((_) {}, onError: (Object _) {});
    return hasil;
  }

  /// Laporan hari ini yang sudah dibaca (instan, tanpa menunggu). null = belum pernah dibaca sejak app dibuka.
  /// v1.0.17 (sinkron atomik): segel laporan hari ini sesudah SEMUA antrean diterima server. Status tersinkron /
  /// tombol WA hanya diberikan kalau segel cocok dengan isi laporan (lihat core/sinkron_atomik.dart).
  late final PenyegelSinkron penyegel = PenyegelSinkron(
      modul: 'HARTEK', endpoint: 'segelSinkronHartek', baca: _gudang.bacaMaster, tulis: _gudang.tulisMaster, panggil: _panggil)
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
    final n = HartekLokal.hitung(d);
    return tahapSinkron('HARTEK', doc: d, menunggu: n.menunggu, gagal: n.gagal, segel: penyegel.instan(s.userId, tgl));
  }

  Map<String, dynamic>? docInstan(Sesi s) => _kunciDoc == '${s.userId}|${tanggalIni()}' ? _doc : null;

  /// Laporan hari ini dari HP.
  Future<Map<String, dynamic>> doc(Sesi s) => _kunci(() => _baca(s.userId, tanggalIni()));

  Future<Map<String, dynamic>> _baca(String userId, String tanggal) async {
    final k = '$userId|$tanggal';
    if (_kunciDoc == k && _doc != null) return _doc!;
    final j = await _gudang.bacaDoc(userId, tanggal);
    Map<String, dynamic> d;
    try {
      d = j == null ? HartekLokal.kosong(tanggal) : Map<String, dynamic>.from(jsonDecode(j) as Map);
    } catch (_) {
      d = HartekLokal.kosong(tanggal);
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
    final d = HartekLokal.salin(await _baca(userId, tanggal));
    f(d);
    await _tulis(userId, tanggal, d);
    return d;
  }

  // ---------- tulis lokal (dipanggil form) ----------

  /// Laporan Utama hari ini. Satu per tim per hari (aturan server tetap berlaku saat dikirim).
  Future<String> buatHeader(Sesi s, Map<String, dynamic> isian) => _kunci(() async {
        final tgl = tanggalIni();
        final d0 = await _baca(s.userId, tgl);
        if (d0['header'] != null) throw ApiException('LAPORAN_UTAMA_SUDAH_DIBUAT');
        final id = _uuid.v4();
        final kirim = <String, dynamic>{
          for (final e in isian.entries)
            if (!e.key.startsWith('_akurasi_')) e.key: e.value,
        };
        await _gudang.tambahOp(
            OpHartek(userId: s.userId, tanggal: tgl, aksi: 'buatHeader', target: id, data: {'headerId': id, ...kirim}));
        await _ubahDoc(s.userId, tgl,
            (d) => HartekLokal.buatHeader(d, {'headerId': id, 'kodeHeader': '', 'hari': '', 'revision': 1, ...isian}));
        return id;
      });

  /// Ubah Laporan Utama. Header yang ditolak server = isian kirimannya diperbaiki lalu dikirim ulang.
  Future<void> ubahHeader(Sesi s, Map<String, dynamic> isian) => _kunci(() async {
        final tgl = tanggalIni();
        final h = (await _baca(s.userId, tgl))['header'];
        if (h is! Map) throw ApiException('DATA_TIDAK_DITEMUKAN');
        final id = '${h['headerId']}';
        final kirim = <String, dynamic>{
          for (final e in isian.entries)
            if (!e.key.startsWith('_akurasi_')) e.key: e.value,
        };
        final ops = await _gudang.ops(s.userId);
        final buat = ops.where((o) => o.aksi == 'buatHeader' && o.target == id).firstOrNull;
        if (buat != null && buat.status == OpHartek.gagal) {
          buat
            ..data = {...buat.data, ...kirim}
            ..status = OpHartek.menunggu
            ..galat = null;
          await _gudang.ubahOp(buat);
          await _ubahDoc(s.userId, tgl, (d) {
            HartekLokal.ubahIsianHeader(d, isian, tandaiUbah: false);
            HartekLokal.tandai(d, id, HartekLokal.lokal);
          });
          return;
        }
        final ubah = ops.where((o) => o.aksi == 'ubahHeader' && o.target == id).firstOrNull;
        if (ubah != null) {
          ubah
            ..data = {...ubah.data, ...kirim}
            ..status = OpHartek.menunggu
            ..galat = null;
          await _gudang.ubahOp(ubah);
        } else {
          await _gudang.tambahOp(
              OpHartek(userId: s.userId, tanggal: tgl, aksi: 'ubahHeader', target: id, data: {'headerId': id, ...kirim}));
        }
        await _ubahDoc(s.userId, tgl, (d) => HartekLokal.ubahIsianHeader(d, isian, tandaiUbah: true));
      });

  /// Lokasi pekerjaan (PG). [data] = isian untuk server, [tampil] = isian untuk layar (mis. penyulang dari master gardu).
  Future<String> tambahPg(Sesi s, Map<String, dynamic> data, Map<String, dynamic> tampil) => _kunci(() async {
        final tgl = tanggalIni();
        final h = (await _baca(s.userId, tgl))['header'];
        if (h is! Map) throw ApiException('DATA_TIDAK_DITEMUKAN');
        final id = _uuid.v4();
        await _gudang.tambahOp(OpHartek(
            userId: s.userId,
            tanggal: tgl,
            aksi: 'simpanPg',
            target: id,
            data: {...data, 'headerId': '${h['headerId']}', 'idBaris': id}));
        await _ubahDoc(s.userId, tgl, (d) => HartekLokal.tambahPg(d, {...tampil, 'pgId': id, 'kodePg': ''}));
        return id;
      });

  Future<String> tambahPekerjaan(Sesi s, String pgId, Map<String, dynamic> data, Map<String, dynamic> tampil) =>
      _kunci(() async {
        final tgl = tanggalIni();
        if (HartekLokal.pg(await _baca(s.userId, tgl), pgId) == null) throw ApiException('DATA_TIDAK_DITEMUKAN');
        final id = _uuid.v4();
        await _gudang.tambahOp(OpHartek(
            userId: s.userId, tanggal: tgl, aksi: 'simpanPekerjaan', target: id, data: {...data, 'pgId': pgId, 'idBaris': id}));
        await _ubahDoc(s.userId, tgl,
            (d) => HartekLokal.tambahPekerjaan(d, pgId, {...tampil, 'pekerjaanId': id, 'kodePekerjaan': ''}));
        return id;
      });

  /// v0.97.0 / v0.97.4 (Master Guswan 15 Okt 2026): ubah rincian pekerjaan yang sudah diisi (nama/jenis pekerjaan + jumlah).
  /// Pekerjaan yang BELUM diterima server cukup diperbaiki di antreannya, jadi tidak ada panggilan ubah yang ditolak.
  Future<void> ubahPekerjaan(Sesi s, String pekerjaanId, Map<String, dynamic> data, Map<String, dynamic> tampil) =>
      _kunci(() async {
        final tgl = tanggalIni();
        if (HartekLokal.pekerjaan(await _baca(s.userId, tgl), pekerjaanId) == null) {
          throw ApiException('DATA_TIDAK_DITEMUKAN');
        }
        final ops = await _gudang.ops(s.userId);
        final buat = ops.where((o) => o.aksi == 'simpanPekerjaan' && o.target == pekerjaanId).firstOrNull;
        if (buat != null) {
          buat
            ..data = {...buat.data, ...data}
            ..status = OpHartek.menunggu
            ..galat = null;
          await _gudang.ubahOp(buat);
          await _ubahDoc(s.userId, tgl, (d) {
            HartekLokal.ubahIsianPekerjaan(d, pekerjaanId, tampil, tandaiUbah: false);
            HartekLokal.tandai(d, pekerjaanId, HartekLokal.lokal);
          });
          return;
        }
        final ubah = ops.where((o) => o.aksi == 'ubahPekerjaan' && o.target == pekerjaanId).firstOrNull;
        if (ubah != null) {
          ubah
            ..data = {...ubah.data, ...data}
            ..status = OpHartek.menunggu
            ..galat = null;
          await _gudang.ubahOp(ubah);
        } else {
          await _gudang.tambahOp(OpHartek(
              userId: s.userId,
              tanggal: tgl,
              aksi: 'ubahPekerjaan',
              target: pekerjaanId,
              data: {'pekerjaanId': pekerjaanId, ...data}));
        }
        await _ubahDoc(s.userId, tgl, (d) => HartekLokal.ubahIsianPekerjaan(d, pekerjaanId, tampil, tandaiUbah: true));
      });

  /// Material / grounding / pemerataan satu pekerjaan. v1.0.0: [foto] = {SLOT: path file di HP} ikut antre sesudah
  /// rinciannya (dikirim uploadFotoHartek setelah rincian diterima server).
  Future<String> tambahAnak(Sesi s, String jenis, String pekerjaanId, Map<String, dynamic> data, Map<String, dynamic> tampil,
          {Map<String, String> foto = const {}}) =>
      _kunci(() async {
        final aksi = HartekLokal.anakPekerjaan[jenis];
        final tgl = tanggalIni();
        if (aksi == null || HartekLokal.pekerjaan(await _baca(s.userId, tgl), pekerjaanId) == null) {
          throw ApiException('DATA_TIDAK_DITEMUKAN');
        }
        final id = _uuid.v4();
        await _gudang.tambahOp(OpHartek(
            userId: s.userId, tanggal: tgl, aksi: aksi, target: id, data: {...data, 'pekerjaanId': pekerjaanId, 'idBaris': id}));
        final slot = HartekLokal.slotWajib(jenis, tampil);
        final fotoSah = {for (final e in foto.entries) if (slot.contains(e.key) && e.value.isNotEmpty) e.key: e.value};
        for (final e in fotoSah.entries) {
          await _gudang.tambahOp(_opFoto(s.userId, tgl, jenis, id, e.key, e.value));
        }
        await _ubahDoc(s.userId, tgl, (d) {
          HartekLokal.tambahAnak(d, jenis, pekerjaanId, {...tampil, 'idBaris': id, HartekLokal.kodeAksi[aksi]!: ''});
          for (final e in fotoSah.entries) {
            HartekLokal.tambahFoto(d, id, e.key, e.value);
          }
        });
        return id;
      });

  OpHartek _opFoto(String userId, String tgl, String jenis, String idBaris, String slot, String path) => OpHartek(
      userId: userId,
      tanggal: tgl,
      aksi: 'uploadFoto',
      target: HartekLokal.targetFoto(idBaris, slot),
      data: {'jenis': jenis, 'idBaris': idBaris, 'slot': slot, 'path': path});

  /// v1.0.0: foto susulan untuk rincian yang sudah dicatat (slot yang belum punya foto di HP / server).
  Future<void> tambahFoto(Sesi s, String jenis, String idBaris, String slot, String path) => _kunci(() async {
        final tgl = tanggalIni();
        final n = HartekLokal.cari(await _baca(s.userId, tgl), idBaris);
        if (n == null || !(HartekLokal.slotFoto[jenis] ?? const <String>[]).contains(slot)) {
          throw ApiException('DATA_TIDAK_DITEMUKAN');
        }
        if (!HartekLokal.slotWajib(jenis, n).contains(slot)) throw ApiException('PEKERJAAN_TIDAK_SESUAI');
        if (HartekLokal.fotoDiServer(n)[slot] != null || HartekLokal.fotoDiHp(n)[slot] != null) {
          throw ApiException('FOTO_SUDAH_ADA');
        }
        await _gudang.tambahOp(_opFoto(s.userId, tgl, jenis, idBaris, slot, path));
        await _ubahDoc(s.userId, tgl, (d) => HartekLokal.tambahFoto(d, idBaris, slot, path));
      });

  /// v1.0.0: kirim ulang foto yang ditolak server.
  Future<void> cobaUlangFoto(Sesi s, String idBaris, String slot) => _kunci(() async {
        final t = HartekLokal.targetFoto(idBaris, slot);
        for (final o in await _gudang.ops(s.userId)) {
          if (o.aksi == 'uploadFoto' && o.target == t && o.status == OpHartek.gagal) {
            await _gudang.aturStatusOp(o.id, OpHartek.menunggu, null);
          }
        }
        await _ubahDoc(s.userId, tanggalIni(), (d) => HartekLokal.tandaiFoto(d, idBaris, slot, HartekLokal.lokal));
      });

  /// v1.0.0: buang foto yang belum diterima server (antrean + file di HP). Rinciannya tetap.
  Future<void> buangFoto(Sesi s, String idBaris, String slot) => _kunci(() async {
        final t = HartekLokal.targetFoto(idBaris, slot);
        for (final o in await _gudang.ops(s.userId)) {
          if (o.aksi == 'uploadFoto' && o.target == t) await _gudang.hapusOp(o.id);
        }
        String? path;
        await _ubahDoc(s.userId, tanggalIni(), (d) => path = HartekLokal.buangFoto(d, idBaris, slot));
        await _hapusFoto(path);
      });

  // ---------- data ditolak: coba lagi / buang ----------

  /// Kirim ulang data yang ditolak (mis. sesudah master diperbaiki admin). [ubahHeader] = perubahan Laporan Utama.
  Future<void> cobaUlang(Sesi s, String id, {bool ubahHeader = false}) => _kunci(() async {
        final tgl = tanggalIni();
        for (final o in await _gudang.ops(s.userId)) {
          if (o.target != id || o.status != OpHartek.gagal || (o.aksi == 'ubahHeader') != ubahHeader) continue;
          await _gudang.aturStatusOp(o.id, OpHartek.menunggu, null);
        }
        await _ubahDoc(s.userId, tgl, (d) {
          if (ubahHeader) {
            HartekLokal.tandaiUbahHeader(d, HartekLokal.lokal);
          } else {
            HartekLokal.tandai(d, id, HartekLokal.lokal);
          }
        });
      });

  /// Buang data yang belum diterima server beserta turunannya. [ubahHeader] = batalkan perubahan Laporan Utama
  /// (nilai server dipakai lagi saat laporan ditarik).
  Future<void> buang(Sesi s, String id, {bool ubahHeader = false}) => _kunci(() async {
        final tgl = tanggalIni();
        final d0 = await _baca(s.userId, tgl);
        if (ubahHeader) {
          for (final o in await _gudang.ops(s.userId)) {
            if (o.aksi == 'ubahHeader' && o.target == id) await _gudang.hapusOp(o.id);
          }
          await _ubahDoc(s.userId, tgl, (d) => HartekLokal.tandaiUbahHeader(d, null));
          return;
        }
        final n = HartekLokal.cari(d0, id);
        if (n != null && !HartekLokal.tertunda(n)) return; // sudah di server: tidak dibuang dari HP
        final ids = HartekLokal.idTurunan(d0, id).toSet();
        final file = <String>[];
        for (final o in await _gudang.ops(s.userId)) {
          if (o.tanggal != tgl) continue;
          final foto = o.aksi == 'uploadFoto' && ids.contains('${o.data['idBaris'] ?? ''}');
          if (foto) file.add('${o.data['path'] ?? ''}');
          if (ids.contains(o.target) || foto) await _gudang.hapusOp(o.id);
        }
        await _ubahDoc(s.userId, tgl, (d) => HartekLokal.buang(d, id));
        for (final f in file) {
          await _hapusFoto(f);
        }
      });

  /// v0.97.0: kirim ulang perubahan jumlah pekerjaan yang ditolak server.
  Future<void> cobaUlangUbahPekerjaan(Sesi s, String pekerjaanId) => _kunci(() async {
        for (final o in await _gudang.ops(s.userId)) {
          if (o.aksi == 'ubahPekerjaan' && o.target == pekerjaanId && o.status == OpHartek.gagal) {
            await _gudang.aturStatusOp(o.id, OpHartek.menunggu, null);
          }
        }
        await _ubahDoc(s.userId, tanggalIni(), (d) => HartekLokal.tandaiUbahNode(d, pekerjaanId, HartekLokal.lokal));
      });

  /// v0.97.0: batalkan perubahan jumlah pekerjaan (nilai server dipakai lagi saat laporan ditarik).
  Future<void> buangUbahPekerjaan(Sesi s, String pekerjaanId) => _kunci(() async {
        for (final o in await _gudang.ops(s.userId)) {
          if (o.aksi == 'ubahPekerjaan' && o.target == pekerjaanId) await _gudang.hapusOp(o.id);
        }
        await _ubahDoc(s.userId, tanggalIni(), (d) => HartekLokal.tandaiUbahNode(d, pekerjaanId, null));
      });

  /// Antrean tanggal lain (laporan hari sebelumnya yang tidak sempat terkirim). Server hanya menerima hari ini.
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

  /// Data Hartek akun ini yang belum diterima server (menunggu + ditolak).
  Future<int> jumlahTertunda(String userId) async => (await _gudang.ops(userId)).length;

  // ---------- kirim ke server ----------

  /// Kirim antrean berurutan. Jaringan putus / sesi habis = berhenti (ApiException / galat jaringan diteruskan).
  /// Data ditolak = ditandai GAGAL dengan alasan, anaknya menunggu, antrean lain jalan terus.
  Future<HasilKirimHartek> kirim(Sesi s) async {
    var terkirim = 0, gagal = 0;
    final percobaan = <int, int>{};
    while (true) {
      final semua = await _kunci(() => _gudang.ops(s.userId));
      final blok = <String>{
        for (final o in semua)
          if (o.status == OpHartek.gagal && HartekLokal.aksiBuat(o.aksi)) o.target,
      };
      OpHartek? op;
      for (final o in semua) {
        if (o.status != OpHartek.menunggu) continue;
        final induk = HartekLokal.induk(o.aksi, o.data);
        final sudah = (percobaan[o.id] ?? 0) >= 3;
        if ((induk != null && blok.contains(induk)) || sudah) {
          if (HartekLokal.aksiBuat(o.aksi)) blok.add(o.target);
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
    // v1.0.0: file foto lapangan lebih dari 8 hari (antrean hari lama tidak bisa dikirim lagi)
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
    if (op.aksi == 'ubahHeader') {
      final h = (await _kunci(() => _baca(s.userId, op.tanggal)))['header'];
      data['revision'] = h is Map && h['revision'] is num ? h['revision'] : 1;
    } else if (op.aksi == 'ubahPekerjaan') {
      final pk = HartekLokal.pekerjaan(await _kunci(() => _baca(s.userId, op.tanggal)), op.target);
      data['revision'] = pk != null && pk['revision'] is num ? pk['revision'] : 1;
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
      final r = await _panggil(s, HartekLokal.endpoint[op.aksi]!, data);
      await _kunci(() => _diterima(s, op, r, snapshot));
      return _Hasil.terkirim;
    } on ApiException catch (e) {
      if (KodeError.sesiHabis.contains(e.kode) || putus(e.kode)) rethrow;
      if (op.aksi == 'buatHeader' && e.kode == 'LAPORAN_UTAMA_SUDAH_DIBUAT') {
        // laporan hari ini sudah dibuat HP ini sebelumnya (mis. data app dihapus): ikut laporan di server
        final h = (await _panggil(s, 'getHartekHarian', const {}))['header'];
        if (h is Map && '${h['headerId'] ?? ''}'.isNotEmpty) {
          await _kunci(() => _diterima(s, op, {'headerId': '${h['headerId']}', 'kodeHeader': '${h['kodeHeader'] ?? ''}'}, snapshot));
          return _Hasil.terkirim;
        }
      }
      if (op.aksi == 'ubahHeader' && e.kode == 'KONFLIK_REVISION' && ke < 3) {
        // perangkat lain tim mengubah laporan: pakai revision terbaru lalu kirim ulang perubahan ini
        final h = (await _panggil(s, 'getHartekHarian', const {}))['header'];
        if (h is Map && '${h['headerId']}' == op.target) {
          await _kunci(() async {
            final d = HartekLokal.salin(await _baca(s.userId, op.tanggal));
            final hd = d['header'];
            if (hd is Map) hd['revision'] = h['revision'];
            await _tulis(s.userId, op.tanggal, d);
          });
          return _Hasil.ulang;
        }
      }
      if (op.aksi == 'ubahPekerjaan' && e.kode == 'KONFLIK_REVISION' && ke < 3) {
        // perangkat lain tim mengubah pekerjaan ini: pakai revision terbaru lalu kirim ulang perubahan ini
        final srv = await _panggil(s, 'getHartekHarian', const {});
        final pkSrv = HartekLokal.pekerjaan(srv, op.target);
        if (pkSrv != null && pkSrv['revision'] is num) {
          await _kunci(() async {
            final d = HartekLokal.salin(await _baca(s.userId, op.tanggal));
            final pk = HartekLokal.pekerjaan(d, op.target);
            if (pk != null) pk['revision'] = pkSrv['revision'];
            await _tulis(s.userId, op.tanggal, d);
          });
          return _Hasil.ulang;
        }
      }
      await _kunci(() => _gagalkan(s, op, pesanHartek(e.kode)));
      return _Hasil.gagal;
    }
  }

  Future<void> _diterima(Sesi s, OpHartek op, Map<String, dynamic> r, String snapshot) async {
    final d = HartekLokal.salin(await _baca(s.userId, op.tanggal));
    if (op.aksi == 'buatHeader') {
      final baru = '${r['headerId'] ?? ''}'.isEmpty ? op.target : '${r['headerId']}';
      if (baru != op.target) {
        // digabung ke Laporan Utama tim dari perangkat lain: semua antrean ikut ID header server
        HartekLokal.gantiHeaderId(d, op.target, baru, '${r['kodeHeader'] ?? ''}');
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
        HartekLokal.diterima(d, op.aksi, op.target, r);
      }
    } else if (op.aksi == 'uploadFoto') {
      HartekLokal.tandaiFoto(d, '${op.data['idBaris']}', '${op.data['slot']}', null, link: '${r['link'] ?? ''}');
    } else if (op.aksi == 'ubahHeader') {
      final h = d['header'];
      if (h is Map && r['revision'] != null) h['revision'] = r['revision'];
    } else if (op.aksi == 'ubahPekerjaan') {
      final pk = HartekLokal.pekerjaan(d, op.target);
      if (pk != null) {
        if (r['revision'] != null) pk['revision'] = r['revision'];
        if ('${r['pekerjaan'] ?? ''}'.trim().isNotEmpty) pk['pekerjaan'] = '${r['pekerjaan']}'.trim();
        if ('${r['jenisId'] ?? ''}'.trim().isNotEmpty) pk['jenisId'] = '${r['jenisId']}'.trim();
        if ('${r['satuanPekerjaan'] ?? ''}'.trim().isNotEmpty) pk['satuanPekerjaan'] = '${r['satuanPekerjaan']}'.trim();
        if (r.containsKey('kolomGaspol')) pk['kolomGaspol'] = '${r['kolomGaspol'] ?? ''}'.trim();
      }
    } else {
      HartekLokal.diterima(d, op.aksi, op.target, r);
    }
    // isian diubah petugas selama dikirim (ubah Laporan Utama): antrean tetap, dikirim lagi dengan isian baru
    final kini = (await _gudang.ops(s.userId)).where((o) => o.id == op.id).firstOrNull;
    final aksiUbah = op.aksi == 'ubahHeader' || op.aksi == 'ubahPekerjaan';
    final berubah = kini != null && aksiUbah && jsonEncode(kini.data) != snapshot;
    if (kini != null && !berubah) await _gudang.hapusOp(op.id);
    if (op.aksi == 'ubahHeader' && !berubah) HartekLokal.tandaiUbahHeader(d, null);
    if (op.aksi == 'ubahPekerjaan' && !berubah) HartekLokal.tandaiUbahNode(d, op.target, null);
    await _tulis(s.userId, op.tanggal, d);
  }

  Future<void> _gagalkan(Sesi s, OpHartek op, String pesan) async {
    await _gudang.aturStatusOp(op.id, OpHartek.gagal, pesan);
    await _ubahDoc(s.userId, op.tanggal, (d) {
      if (op.aksi == 'uploadFoto') {
        HartekLokal.tandaiFoto(d, '${op.data['idBaris']}', '${op.data['slot']}', HartekLokal.gagal, pesan: pesan);
      } else if (op.aksi == 'ubahHeader') {
        HartekLokal.tandaiUbahHeader(d, HartekLokal.gagal, pesan: pesan);
      } else if (op.aksi == 'ubahPekerjaan') {
        HartekLokal.tandaiUbahNode(d, op.target, HartekLokal.gagal, pesan: pesan);
      } else {
        HartekLokal.tandai(d, op.target, HartekLokal.gagal, pesan: pesan);
      }
    });
  }

  /// Tarik laporan hari ini dari server (data perangkat lain tim + kode) lalu gabungkan dengan data lokal.
  Future<void> tarik(Sesi s) async {
    final srv = await _panggil(s, 'getHartekHarian', const {});
    final tgl = '${srv['tanggal'] ?? ''}';
    if (tgl != tanggalIni()) return; // jam HP beda hari dengan server: jangan timpa laporan lokal
    await _kunci(() async {
      final d = await _baca(s.userId, tgl);
      await _tulis(s.userId, tgl, HartekLokal.gabung(d, srv));
    });
  }

  // ---------- master (dropdown) ----------

  /// Master untuk form: dari HP kalau ada (langsung), diperbarui di latar kalau sudah lebih dari 30 menit.
  /// Belum pernah diunduh = diunduh sekarang (butuh sinyal sekali).
  Future<Map<String, dynamic>> master(Sesi s, String jenis) async {
    final ada = await _gudang.bacaMaster('hartek_$jenis');
    if (ada != null) {
      if (_jam().difference(ada.diambil) > umurMaster) {
        unawaited(_unduhMaster(s, jenis).then<void>((_) {}, onError: (Object _) {}));
      }
      return Map<String, dynamic>.from(jsonDecode(ada.json) as Map);
    }
    return _unduhMaster(s, jenis);
  }

  Future<Map<String, dynamic>> _unduhMaster(Sesi s, String jenis) async {
    final r = await _panggil(s, endpointMaster[jenis]!, const {});
    await _gudang.tulisMaster('hartek_$jenis', jsonEncode(r));
    return r;
  }

  /// Dipanggil sync: master Hartek + Master Gardu disiapkan supaya form bisa dibuka tanpa sinyal.
  Future<void> segarkanMaster(Sesi s, {bool paksa = false}) async {
    for (final j in endpointMaster.keys) {
      final ada = await _gudang.bacaMaster('hartek_$j');
      if (paksa || ada == null || _jam().difference(ada.diambil) > umurMaster) await _unduhMaster(s, j);
    }
    await _siapkanGardu?.call(s);
  }
}

enum _Hasil { terkirim, gagal, ulang }
