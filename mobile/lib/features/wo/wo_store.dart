import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../../core/api_client.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../hartek/foto_lapangan.dart';
import '../hartek/hartek_lokal.dart';
import '../hartek/hartek_store.dart' show GudangHartek, OpHartek, PanggilHartek, HasilKirimHartek, HartekStore;
import 'wo_bantu.dart';

/// v1.0.16 (permintaan kvlar 22 Okt 2026): WO tindak lanjut tim bisa dikerjakan OFFLINE (pola HartekStore).
///
/// Dokumen lokal (wo_lokal, kunci tanggal 'WO'):
///   server : jawaban getWoTim terakhir (daftar WO tim + master isian), dibaca layar walau tanpa sinyal
///   lokal  : {temuanId: isian HP yang belum / sedang dikirim} (lihat [WoLokal])
///   kabar  : pemberitahuan untuk petugas (WO diputuskan admin, WO dipindah) sampai ditutup
/// Antrean FIFO (wo_antre): mulai > pekerjaan > foto > hapus > selesai, per WO. Simpan = tulis HP + antre, kirim di latar.
///
/// WO dipindah admin selama petugas bekerja offline: kiriman pertama ditolak WO_DIPINDAH. Antrean WO itu DITAHAN dan
/// layar menampilkan kartu pilihan: tetap unggah (mulaiWo paksa = KLAIM WO ganda) atau batalkan (antrean + foto dibuang).
/// Selesai yang ditahan server (menungguVerifikasi) menunggu keputusan admin; tim terpilih = Selesai dikirim ulang
/// otomatis, tim lain = WO dibuang dari HP.
class WoStore extends ChangeNotifier {
  WoStore(this._gudang, this._panggil, {Future<List<int>?> Function(String path)? bacaFoto, Future<void> Function(String? path)? hapusFoto})
      : _bacaFoto = bacaFoto ?? FotoLapangan.baca,
        _hapusFoto = hapusFoto ?? FotoLapangan.hapus;

  final GudangHartek _gudang;
  final PanggilHartek _panggil;
  final Future<List<int>?> Function(String path) _bacaFoto;
  final Future<void> Function(String? path) _hapusFoto;

  static const kunciDoc = 'WO';
  static const folderFoto = 'wo';

  Map<String, dynamic>? _doc;
  String? _userDoc;
  Future<void> _rantai = Future<void>.value();
  bool _kirimJalan = false, _lagi = false;

  Future<T> _kunci<T>(Future<T> Function() f) {
    final hasil = _rantai.then((_) => f());
    _rantai = hasil.then<void>((_) {}, onError: (Object _) {});
    return hasil;
  }

  /// Dokumen di memori (tanpa menunggu), untuk build pertama layar.
  Map<String, dynamic>? docInstan(Sesi s) => _userDoc == s.userId ? _doc : null;

  Future<Map<String, dynamic>> doc(Sesi s) => _kunci(() => _baca(s.userId));

  Future<Map<String, dynamic>> _baca(String userId) async {
    if (_userDoc == userId && _doc != null) return _doc!;
    final j = await _gudang.bacaDoc(userId, kunciDoc);
    Map<String, dynamic> d;
    try {
      d = j == null ? WoLokal.kosong() : Map<String, dynamic>.from(jsonDecode(j) as Map);
    } catch (_) {
      d = WoLokal.kosong();
    }
    _doc = d;
    _userDoc = userId;
    return d;
  }

  Future<void> _tulis(String userId, Map<String, dynamic> d) async {
    await _gudang.tulisDoc(userId, kunciDoc, jsonEncode(d));
    _doc = d;
    _userDoc = userId;
    notifyListeners();
  }

  Future<Map<String, dynamic>> _ubah(String userId, void Function(Map<String, dynamic> d) f) async {
    final d = WoLokal.salin(await _baca(userId));
    f(d);
    await _tulis(userId, d);
    return d;
  }

  OpHartek _op(String userId, String aksi, String target, Map<String, dynamic> data) =>
      OpHartek(userId: userId, tanggal: kunciDoc, aksi: aksi, target: target, data: data);

  Future<int> jumlahTertunda(String userId) async => (await _gudang.ops(userId)).length;

  // ---------- tulis lokal ----------

  /// Mulai kerjakan WO (offline). Sesudah ini pekerjaan bisa dicatat walau belum ada sinyal.
  Future<void> mulai(Sesi s, Map<String, dynamic> t) => _kunci(() async {
        final id = teksWo(t['temuanId']);
        final ops = await _gudang.ops(s.userId);
        if (!ops.any((o) => o.aksi == 'mulai' && o.target == id)) {
          await _gudang.tambahOp(_op(s.userId, 'mulai', id, {'temuanId': id}));
        }
        await _ubah(s.userId, (d) {
          final l = WoLokal.lokalWo(d, id, t);
          l['mulai'] = true;
          l['waktuMulai'] = DateTime.now().toUtc().toIso8601String();
        });
      });

  /// Catat pekerjaan + foto yang sudah diambil (foto lain bisa menyusul). [tampil] = isian untuk kartu sebelum server
  /// menjawab (pekerjaan, diameter, jumlah, satuan, section, rincian, ...).
  Future<void> simpanPekerjaan(Sesi s, Map<String, dynamic> t, String tlId, Map<String, dynamic> data, Map<String, dynamic> tampil,
          Map<String, String> foto) =>
      _kunci(() async {
        final id = teksWo(t['temuanId']);
        await _gudang.tambahOp(_op(s.userId, 'pekerjaan', tlId, {'temuanId': id, 'idBaris': tlId, ...data}));
        for (final e in foto.entries) {
          await _gudang.tambahOp(_op(s.userId, 'foto', '$tlId#${e.key}', {'temuanId': id, 'tlId': tlId, 'slot': e.key, 'path': e.value}));
        }
        await _ubah(s.userId, (d) {
          final l = WoLokal.lokalWo(d, id, t);
          WoLokal.peta(l, 'pekerjaan')[tlId] = {
            'tlId': tlId,
            'tampil': tampil,
            'status': HartekLokal.lokal,
            'dibuat': DateTime.now().toUtc().toIso8601String(),
          };
          final f = WoLokal.peta(WoLokal.peta(l, 'foto'), tlId);
          for (final e in foto.entries) {
            f[e.key] = {'path': e.value, 'status': HartekLokal.lokal};
          }
        });
      });

  /// Foto susulan untuk pekerjaan yang sudah dicatat (simpan bertahap: sebelum dulu, pekerjaan + sesudah menyusul).
  Future<void> tambahFoto(Sesi s, Map<String, dynamic> t, String tlId, String slot, String path) => _kunci(() async {
        final id = teksWo(t['temuanId']);
        final target = '$tlId#$slot';
        for (final o in await _gudang.ops(s.userId)) {
          if (o.aksi == 'foto' && o.target == target) {
            await _hapusFoto('${o.data['path'] ?? ''}');
            await _gudang.hapusOp(o.id);
          }
        }
        await _gudang.tambahOp(_op(s.userId, 'foto', target, {'temuanId': id, 'tlId': tlId, 'slot': slot, 'path': path}));
        await _ubah(s.userId, (d) {
          final l = WoLokal.lokalWo(d, id, t);
          WoLokal.peta(WoLokal.peta(l, 'foto'), tlId)[slot] = {'path': path, 'status': HartekLokal.lokal};
        });
      });

  Future<void> buangFoto(Sesi s, String temuanId, String tlId, String slot) => _kunci(() async {
        for (final o in await _gudang.ops(s.userId)) {
          if (o.aksi == 'foto' && o.target == '$tlId#$slot') await _gudang.hapusOp(o.id);
        }
        String? path;
        await _ubah(s.userId, (d) {
          final f = WoLokal.peta(WoLokal.peta(WoLokal.peta(WoLokal.peta(d, 'lokal'), temuanId), 'foto'), tlId);
          path = teksWo(WoLokal.peta(f, slot)['path']);
          f.remove(slot);
        });
        await _hapusFoto(path);
      });

  /// Kirim ulang op yang ditolak (foto / pekerjaan / selesai) untuk WO [temuanId].
  Future<void> cobaUlang(Sesi s, String temuanId) => _kunci(() async {
        for (final o in await _gudang.ops(s.userId)) {
          if ('${o.data['temuanId'] ?? ''}' == temuanId && o.status == OpHartek.gagal) {
            await _gudang.aturStatusOp(o.id, OpHartek.menunggu, null);
          }
        }
        await _ubah(s.userId, (d) => WoLokal.tandaiUlang(d, temuanId));
      });

  /// Hapus pekerjaan: belum terkirim = buang dari antrean; sudah di server = antre hapusPekerjaanWo.
  Future<void> hapusPekerjaan(Sesi s, String temuanId, Map<String, dynamic> p) => _kunci(() async {
        final tlId = teksWo(p['tlId']);
        final ops = await _gudang.ops(s.userId);
        final belumKirim = ops.any((o) => o.aksi == 'pekerjaan' && o.target == tlId);
        for (final o in ops) {
          if ((o.aksi == 'pekerjaan' && o.target == tlId) || (o.aksi == 'foto' && '${o.data['tlId'] ?? ''}' == tlId)) {
            if (o.aksi == 'foto') await _hapusFoto('${o.data['path'] ?? ''}');
            await _gudang.hapusOp(o.id);
          }
        }
        if (!belumKirim) {
          await _gudang.tambahOp(_op(s.userId, 'hapus', tlId,
              {'temuanId': temuanId, 'tlId': tlId, 'revision': num.tryParse(teksWo(p['revision']))?.toInt() ?? 1}));
        }
        await _ubah(s.userId, (d) {
          final l = WoLokal.peta(WoLokal.peta(d, 'lokal'), temuanId);
          WoLokal.peta(l, 'pekerjaan').remove(tlId);
          WoLokal.peta(l, 'foto').remove(tlId);
          if (!belumKirim) l['hapus'] = [...WoLokal.teks(l['hapus']), tlId];
        });
      });

  /// Selesai (offline). Hartek lokasi Jaringan: [isi] = daerah + jumlahGawang.
  Future<void> selesai(Sesi s, Map<String, dynamic> t, Map<String, dynamic> isi) => _kunci(() async {
        final id = teksWo(t['temuanId']);
        for (final o in await _gudang.ops(s.userId)) {
          if (o.aksi == 'selesai' && o.target == id) await _gudang.hapusOp(o.id);
        }
        await _gudang.tambahOp(_op(s.userId, 'selesai', id, {'temuanId': id, ...isi}));
        await _ubah(s.userId, (d) {
          final l = WoLokal.lokalWo(d, id, t);
          l['selesai'] = {'status': HartekLokal.lokal, 'isi': isi};
        });
      });

  /// Kartu WO dipindah: tetap unggah (klaim WO ganda, admin yang memutuskan).
  Future<void> lanjutkanKonflik(Sesi s, String temuanId) => _kunci(() async {
        await _ubah(s.userId, (d) {
          final l = WoLokal.peta(WoLokal.peta(d, 'lokal'), temuanId);
          l['paksa'] = true;
          l.remove('konflik');
        });
      });

  /// Kartu WO dipindah / ditolak: buang seluruh isian HP WO ini.
  Future<void> batalkanWo(Sesi s, String temuanId) => _kunci(() => _buangWo(s.userId, temuanId));

  Future<void> _buangWo(String userId, String temuanId) async {
    for (final o in await _gudang.ops(userId)) {
      if ('${o.data['temuanId'] ?? ''}' != temuanId) continue;
      if (o.aksi == 'foto') await _hapusFoto('${o.data['path'] ?? ''}');
      await _gudang.hapusOp(o.id);
    }
    final d = WoLokal.salin(await _baca(userId));
    final l = WoLokal.peta(d, 'lokal').remove(temuanId);
    if (l is Map) {
      for (final f in WoLokal.peta(Map<String, dynamic>.from(l), 'foto').values) {
        if (f is! Map) continue;
        for (final x in f.values) {
          if (x is Map) await _hapusFoto(teksWo(x['path']));
        }
      }
    }
    await _tulis(userId, d);
  }

  Future<void> tutupKabar(Sesi s, String kunci) =>
      _kunci(() => _ubah(s.userId, (d) => d['kabar'] = [for (final k in WoLokal.daftar(d['kabar'])) if (teksWo(k['kunci']) != kunci) k]));

  // ---------- kirim ----------

  /// Kirim antrean lalu tarik daftar WO. Galat jaringan / sesi = dilempar (pemanggil yang memutuskan).
  Future<HasilKirimHartek> kirim(Sesi s) async {
    if (_kirimJalan) {
      _lagi = true;
      return HasilKirimHartek(0, 0);
    }
    _kirimJalan = true;
    var terkirim = 0, gagal = 0;
    try {
      do {
        _lagi = false;
        final h = await _kirimAntre(s);
        terkirim += h.terkirim;
        gagal += h.gagal;
        await tarik(s);
      } while (_lagi);
    } finally {
      _kirimJalan = false;
    }
    return HasilKirimHartek(terkirim, gagal);
  }

  Future<HasilKirimHartek> _kirimAntre(Sesi s) async {
    var terkirim = 0, gagal = 0;
    final percobaan = <int, int>{};
    final klaimDicoba = <String>{};
    while (true) {
      final semua = await _kunci(() => _gudang.ops(s.userId));
      final d = await _kunci(() => _baca(s.userId));
      final lokal = WoLokal.peta(d, 'lokal');
      // WO yang ditahan: konflik belum dijawab petugas; pekerjaan yang ditolak menahan fotonya
      final tahan = <String>{
        for (final e in lokal.entries)
          if (e.value is Map && (e.value as Map)['konflik'] != null) e.key,
      };
      final tlGagal = {for (final o in semua) if (o.aksi == 'pekerjaan' && o.status == OpHartek.gagal) o.target};
      OpHartek? op;
      for (final o in semua) {
        final tid = '${o.data['temuanId'] ?? ''}';
        if (o.status != OpHartek.menunggu || tahan.contains(tid) || (percobaan[o.id] ?? 0) >= 2) continue;
        if (o.aksi == 'foto' && tlGagal.contains('${o.data['tlId'] ?? ''}')) continue;
        if (o.aksi == 'selesai' && semua.any((x) => x.id < o.id && '${x.data['temuanId'] ?? ''}' == tid)) continue;
        op = o;
        break;
      }
      if (op == null) {
        await _tandaiSelesaiTertahan(s, semua);
        break;
      }
      final tid = '${op.data['temuanId'] ?? ''}';
      final l = lokal[tid] is Map ? Map<String, dynamic>.from(lokal[tid] as Map) : const <String, dynamic>{};
      // petugas memilih tetap unggah: klaim WO ganda dulu (sekali per putaran)
      if (l['paksa'] == true && l['klaim'] != true) {
        if (klaimDicoba.contains(tid)) break;
        klaimDicoba.add(tid);
        await _klaim(s, tid);
        continue;
      }
      percobaan[op.id] = (percobaan[op.id] ?? 0) + 1;
      switch (await _kirimSatu(s, op)) {
        case _Hasil.terkirim:
          terkirim++;
        case _Hasil.gagal:
          gagal++;
        case _Hasil.ulang:
          break;
      }
    }
    return HasilKirimHartek(terkirim, gagal);
  }

  /// v1.0.17 (sinkron atomik): Selesai WO hanya dikirim sesudah SEMUA pekerjaan + foto WO itu diterima server (server
  /// lalu mencatat realisasi dan status Selesai dalam satu kunci). Kalau ada isian WO itu yang ditolak server, Selesai
  /// tertahan: diberi keterangan supaya petugas tahu harus memperbaiki dulu (dulu diam menunggu tanpa tanda).
  Future<void> _tandaiSelesaiTertahan(Sesi s, List<OpHartek> semua) async {
    final tahan = <String, int>{};
    for (final o in semua) {
      if (o.aksi != 'selesai' || o.status != OpHartek.menunggu) continue;
      final tid = '${o.data['temuanId'] ?? ''}';
      final n = semua.where((x) => x.id < o.id && '${x.data['temuanId'] ?? ''}' == tid && x.status == OpHartek.gagal).length;
      if (n > 0) tahan[tid] = n;
    }
    if (tahan.isEmpty) return;
    await _kunci(() => _ubah(s.userId, (d) {
          for (final e in tahan.entries) {
            final l = WoLokal.peta(WoLokal.peta(d, 'lokal'), e.key);
            l['selesai'] = {
              ...WoLokal.peta(l, 'selesai'),
              'galat': '${e.value} data WO ini ditolak server. Kirim ulang / perbaiki dulu; Selesai dikirim sesudah semuanya diterima.',
            };
          }
        }));
  }

  int _revisi(Map<String, dynamic> d, String temuanId) {
    final n = WoLokal.nodeServer(d, temuanId) ?? WoLokal.peta(WoLokal.peta(WoLokal.peta(d, 'lokal'), temuanId), 'node');
    return num.tryParse(teksWo(n['revision']))?.toInt() ?? 1;
  }

  Future<void> _klaim(Sesi s, String temuanId) async {
    final d = await _kunci(() => _baca(s.userId));
    try {
      await _panggil(s, 'mulaiWo', {'temuanId': temuanId, 'revision': _revisi(d, temuanId), 'paksa': true});
      await _kunci(() async {
        for (final o in await _gudang.ops(s.userId)) {
          if (o.aksi == 'mulai' && o.target == temuanId) await _gudang.hapusOp(o.id);
        }
        await _ubah(s.userId, (x) {
          final l = WoLokal.peta(WoLokal.peta(x, 'lokal'), temuanId);
          l['klaim'] = true;
          l['mulai'] = false;
        });
      });
    } on ApiException catch (e) {
      if (KodeError.sesiHabis.contains(e.kode) || HartekStore.putus(e.kode)) rethrow;
      await _kunci(() => _ubah(s.userId, (x) {
            final l = WoLokal.peta(WoLokal.peta(x, 'lokal'), temuanId);
            l['paksa'] = false;
            l['konflik'] = e.kode;
          }));
    }
  }

  Future<_Hasil> _kirimSatu(Sesi s, OpHartek op) async {
    final d = await _kunci(() => _baca(s.userId));
    final tid = '${op.data['temuanId'] ?? ''}';
    final data = Map<String, dynamic>.from(op.data);
    final String aksi;
    switch (op.aksi) {
      case 'mulai':
        aksi = 'mulaiWo';
        data['revision'] = _revisi(d, tid);
      case 'pekerjaan':
        aksi = 'simpanPekerjaanWo';
      case 'foto':
        aksi = 'uploadFotoWo';
        final path = '${op.data['path'] ?? ''}';
        final bytes = await _bacaFoto(path);
        if (bytes == null) {
          await _kunci(() => _gagal(s, op, 'File foto tidak ada lagi di HP. Buang foto ini lalu ambil ulang.'));
          return _Hasil.gagal;
        }
        data
          ..remove('temuanId')
          ..remove('path')
          ..['sumber'] = FotoLapangan.dariGaleri(path) ? 'GALERI' : 'KAMERA'
          ..addAll(FotoLapangan.isiKirim(bytes));
      case 'hapus':
        aksi = 'hapusPekerjaanWo';
        data.remove('temuanId');
      case 'selesai':
        aksi = 'selesaiWo';
        data['revision'] = _revisi(d, tid);
        final isi = WoLokal.peta(WoLokal.peta(WoLokal.peta(WoLokal.peta(d, 'lokal'), tid), 'selesai'), 'isi');
        for (final e in isi.entries) {
          if (teksWo(e.value).isNotEmpty) data[e.key] = e.value;
        }
      default:
        await _kunci(() => _gudang.hapusOp(op.id));
        return _Hasil.ulang;
    }
    try {
      final r = await _panggil(s, aksi, data);
      await _kunci(() => _diterima(s, op, r));
      return _Hasil.terkirim;
    } on ApiException catch (e) {
      if (KodeError.sesiHabis.contains(e.kode) || HartekStore.putus(e.kode)) rethrow;
      if (e.kode == 'KONFLIK_REVISION') {
        try {
          await tarik(s);
        } catch (_) {/* dicoba lagi putaran berikut */}
        return _Hasil.ulang;
      }
      // Laporan Utama / shift belum sampai server: Selesai tetap di antrean, dicoba lagi tiap sinkron
      if (op.aksi == 'selesai' && e.kode == 'WO_BUTUH_LAPORAN_UTAMA') {
        await _kunci(() => _ubah(s.userId, (x) {
              final l = WoLokal.peta(WoLokal.peta(x, 'lokal'), tid);
              l['selesai'] = {...WoLokal.peta(l, 'selesai'), 'galat': pesanWo(e.kode)};
            }));
        return _Hasil.gagal;
      }
      if (WoLokal.kodeKonflik.contains(e.kode)) {
        await _kunci(() => _ubah(s.userId, (x) => WoLokal.peta(WoLokal.peta(x, 'lokal'), tid)['konflik'] = e.kode));
        return _Hasil.gagal;
      }
      // sudah terkirim sebelumnya (kirim ulang setelah sinyal putus di tengah)
      if ((op.aksi == 'foto' && e.kode == 'FOTO_SUDAH_ADA') || (op.aksi == 'hapus' && e.kode == 'DATA_TIDAK_DITEMUKAN')) {
        await _kunci(() => _diterima(s, op, const {}));
        return _Hasil.terkirim;
      }
      await _kunci(() => _gagal(s, op, pesanWo(e.kode)));
      return _Hasil.gagal;
    }
  }

  Future<void> _diterima(Sesi s, OpHartek op, Map<String, dynamic> r) async {
    await _gudang.hapusOp(op.id);
    final tid = '${op.data['temuanId'] ?? ''}';
    if (op.aksi == 'foto') await _hapusFoto('${op.data['path'] ?? ''}');
    await _ubah(s.userId, (d) => WoLokal.diterima(d, op.aksi, tid, op.data, r));
  }

  Future<void> _gagal(Sesi s, OpHartek op, String pesan) async {
    await _gudang.aturStatusOp(op.id, OpHartek.gagal, pesan);
    final tid = '${op.data['temuanId'] ?? ''}';
    await _ubah(s.userId, (d) => WoLokal.tandaiGagal(d, op.aksi, tid, op.data, pesan));
  }

  /// Tarik daftar WO tim dari server, rapikan isian HP yang sudah diterima, tangani keputusan WO ganda.
  Future<void> tarik(Sesi s) async {
    final srv = await _panggil(s, 'getWoTim', const {});
    await _kunci(() async {
      final d = WoLokal.salin(await _baca(s.userId));
      d['server'] = srv;
      d['diambil'] = DateTime.now().toUtc().toIso8601String();
      final ops = await _gudang.ops(s.userId);
      final aksi = WoLokal.rapikan(d, {for (final o in ops) '${o.data['temuanId'] ?? ''}'});
      for (final id in aksi.buang) {
        for (final o in ops) {
          if ('${o.data['temuanId'] ?? ''}' != id) continue;
          if (o.aksi == 'foto') await _hapusFoto('${o.data['path'] ?? ''}');
          await _gudang.hapusOp(o.id);
        }
        for (final p in aksi.fotoBuang[id] ?? const <String>[]) {
          await _hapusFoto(p);
        }
      }
      for (final id in aksi.selesaiUlang) {
        if (!ops.any((o) => o.aksi == 'selesai' && o.target == id)) {
          await _gudang.tambahOp(_op(s.userId, 'selesai', id, {'temuanId': id}));
        }
      }
      if (aksi.selesaiUlang.isNotEmpty) _lagi = true; // kirim() memutar sekali lagi untuk Selesai yang dikirim ulang
      await _tulis(s.userId, d);
    });
  }
}

enum _Hasil { terkirim, gagal, ulang }

/// v1.0.16: logika murni dokumen WO di HP (gabung server + isian HP), diuji tanpa sqflite (wo_store_test.dart).
class WoLokal {
  WoLokal._();

  /// Kode server yang berarti WO bukan lagi milik tim ini: antrean WO ditahan, petugas memilih lanjut / batalkan.
  static const kodeKonflik = {'WO_DIPINDAH', 'BUKAN_MILIK_TIM', 'WO_GANDA_SUDAH_DIPUTUSKAN', 'WO_SUDAH_SELESAI'};

  static Map<String, dynamic> kosong() => {'server': null, 'diambil': null, 'lokal': <String, dynamic>{}, 'kabar': <dynamic>[]};

  static Map<String, dynamic> salin(Map<String, dynamic> d) => Map<String, dynamic>.from(jsonDecode(jsonEncode(d)) as Map);

  /// Anak peta (dibuat kalau belum ada).
  static Map<String, dynamic> peta(Map<String, dynamic> induk, String k) {
    final v = induk[k];
    if (v is Map<String, dynamic>) return v;
    final m = v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};
    induk[k] = m;
    return m;
  }

  static List<Map<String, dynamic>> daftar(Object? v) => daftarWo(v);

  /// Daftar teks (mis. tlId pekerjaan yang menunggu dihapus).
  static List<String> teks(Object? v) => v is List ? [for (final x in v) '$x'] : <String>[];

  static List<Map<String, dynamic>> woServer(Map<String, dynamic> d) => daftarWo(petaWo(d['server'])['wo']);

  static Map<String, dynamic>? nodeServer(Map<String, dynamic> d, String temuanId) {
    for (final t in woServer(d)) {
      if (teksWo(t['temuanId']) == temuanId) return t;
    }
    return null;
  }

  /// Isian lokal satu WO; [t] = node WO saat ini (disalin supaya WO tetap tampil walau sudah tidak di daftar server).
  static Map<String, dynamic> lokalWo(Map<String, dynamic> d, String temuanId, Map<String, dynamic> t) {
    final l = peta(peta(d, 'lokal'), temuanId);
    l['node'] = {
      for (final e in t.entries)
        if (!e.key.startsWith('_') && e.key != 'pekerjaanWo') e.key: e.value,
      'pekerjaanWo': [for (final p in daftarWo(t['pekerjaanWo'])) if (p['_lokal'] != true) p],
    };
    return l;
  }

  static void tandaiUlang(Map<String, dynamic> d, String temuanId) {
    final l = peta(peta(d, 'lokal'), temuanId);
    for (final p in peta(l, 'pekerjaan').values) {
      if (p is Map && p['status'] == HartekLokal.gagal) {
        p['status'] = HartekLokal.lokal;
        p.remove('galat');
      }
    }
    for (final f in peta(l, 'foto').values) {
      if (f is! Map) continue;
      for (final x in f.values) {
        if (x is Map && x['status'] == HartekLokal.gagal) {
          x['status'] = HartekLokal.lokal;
          x.remove('galat');
        }
      }
    }
    final s = l['selesai'];
    if (s is Map && s['status'] == HartekLokal.gagal) {
      s['status'] = HartekLokal.lokal;
      s.remove('galat');
    }
  }

  /// Jawaban server satu op.
  static void diterima(Map<String, dynamic> d, String aksi, String temuanId, Map<String, dynamic> data, Map<String, dynamic> r) {
    final l = peta(peta(d, 'lokal'), temuanId);
    final t = petaWo(r['temuan']);
    switch (aksi) {
      case 'mulai':
        l['mulai'] = false;
        if (r['ganda'] == true) l['klaim'] = true;
        _perbaruiNode(d, l, t);
      case 'pekerjaan':
        final tlId = teksWo(data['idBaris']);
        final p = peta(peta(l, 'pekerjaan'), tlId);
        p['status'] = 'TERKIRIM';
        p.remove('galat');
        if (r['pekerjaan'] is Map) p['server'] = r['pekerjaan'];
      case 'foto':
        final tlId = teksWo(data['tlId']), slot = teksWo(data['slot']);
        peta(peta(l, 'foto'), tlId).remove(slot);
        // tandai di node server supaya kotak foto langsung "terkirim" sebelum daftar ditarik ulang
        peta(l, 'fotoTerkirim')['$tlId#$slot'] = teksWo(r['link']).isEmpty ? 'ok' : teksWo(r['link']);
      case 'hapus':
        break; // tlId tetap di l['hapus'] (disembunyikan) sampai daftar server tidak memuatnya lagi
      case 'selesai':
        if (r['menungguVerifikasi'] == true) {
          l['selesai'] = {...peta(l, 'selesai'), 'status': 'VERIFIKASI'};
        } else {
          l['selesai'] = {...peta(l, 'selesai'), 'status': 'TERKIRIM'};
          _perbaruiNode(d, l, t);
        }
    }
  }

  static void _perbaruiNode(Map<String, dynamic> d, Map<String, dynamic> l, Map<String, dynamic> t) {
    if (t.isEmpty) return;
    final n = nodeServer(d, teksWo(t['temuanId']));
    if (n != null) {
      n['wo'] = {...petaWo(n['wo']), ...petaWo(t['wo'])};
      n['revision'] = t['revision'];
    }
    final node = peta(l, 'node');
    if (node.isNotEmpty) {
      node['wo'] = {...petaWo(node['wo']), ...petaWo(t['wo'])};
      node['revision'] = t['revision'];
    }
  }

  static void tandaiGagal(Map<String, dynamic> d, String aksi, String temuanId, Map<String, dynamic> data, String pesan) {
    final l = peta(peta(d, 'lokal'), temuanId);
    switch (aksi) {
      case 'pekerjaan':
        final p = peta(peta(l, 'pekerjaan'), teksWo(data['idBaris']));
        p['status'] = HartekLokal.gagal;
        p['galat'] = pesan;
      case 'foto':
        final f = peta(peta(peta(l, 'foto'), teksWo(data['tlId'])), teksWo(data['slot']));
        f['status'] = HartekLokal.gagal;
        f['galat'] = pesan;
      case 'selesai':
        l['selesai'] = {...peta(l, 'selesai'), 'status': HartekLokal.gagal, 'galat': pesan};
      default:
        l['galat'] = pesan;
    }
  }

  /// Sesudah tarik: buang isian HP yang sudah ada di server; WO yang diputuskan admin untuk tim lain = dibuang
  /// ([buang], foto [fotoBuang]); tim ini terpilih = Selesai dikirim ulang ([selesaiUlang]). [adaOp] = WO yang masih
  /// punya antrean (isian lokalnya dipertahankan).
  static ({Set<String> buang, Map<String, List<String>> fotoBuang, Set<String> selesaiUlang}) rapikan(
      Map<String, dynamic> d, Set<String> adaOp) {
    final lokal = peta(d, 'lokal');
    final kabar = [...daftarWo(d['kabar'])];
    final buang = <String>{}, ulang = <String>{};
    final fotoBuang = <String, List<String>>{};
    for (final id in lokal.keys.toList()) {
      final l = peta(lokal, id);
      final n = nodeServer(d, id);
      final g = petaWo(petaWo(n?['wo'])['ganda']);
      final judul = teksWo(petaWo(l['node'])['kodeTemuan']).isEmpty ? 'WO' : 'WO ${teksWo(petaWo(l['node'])['kodeTemuan'])}';
      // keputusan admin WO ganda
      if (teksWo(g['status']) == 'DITOLAK' && g['pemilik'] != true) {
        buang.add(id);
        fotoBuang[id] = [
          for (final f in peta(l, 'foto').values)
            if (f is Map)
              for (final x in f.values)
                if (x is Map && teksWo(x['path']).isNotEmpty) teksWo(x['path']),
        ];
        lokal.remove(id);
        kabar.add({
          'kunci': 'ditolak-$id',
          'judul': '$judul diputuskan untuk tim lain',
          'isi': 'Admin memverifikasi tim lain sebagai pelaksana. Isian WO ini di HP sudah dihapus.'
              '${teksWo(g['catatan']).isEmpty ? '' : ' Catatan admin: ${teksWo(g['catatan'])}'}',
        });
        continue;
      }
      final sel = petaWo(l['selesai']);
      if (teksWo(sel['status']) == 'VERIFIKASI' && n != null && g['pemilik'] == true && g['menunggu'] != true &&
          statusWoDari(n) == StatusWo.dikerjakan) {
        l['selesai'] = {...sel, 'status': HartekLokal.lokal};
        ulang.add(id);
        kabar.add({
          'kunci': 'dipilih-$id',
          'judul': '$judul diverifikasi untuk tim Anda',
          'isi': 'Admin memilih tim Anda sebagai pelaksana. WO diselesaikan otomatis dan masuk realisasi tim.',
        });
      }
      // pekerjaan yang sudah tampil di server
      final srvTl = {for (final p in daftarWo(n?['pekerjaanWo'])) teksWo(p['tlId'])};
      final pk = peta(l, 'pekerjaan');
      pk.removeWhere((k, v) => v is Map && v['status'] == 'TERKIRIM' && srvTl.contains(k));
      l['hapus'] = [for (final x in teks(l['hapus'])) if (srvTl.contains(x) && adaOp.contains(id)) x];
      final ft = peta(l, 'foto');
      ft.removeWhere((k, v) => v is! Map || v.isEmpty);
      peta(l, 'fotoTerkirim').removeWhere((k, v) {
        final b = k.split('#');
        return teksWo(petaWo(_pekerjaanServer(n, b.first)?['foto'])[b.last]).isNotEmpty;
      });
      if (n != null && statusWoDari(n) == StatusWo.selesai) l.remove('selesai');
      final kosong = !adaOp.contains(id) && l['konflik'] == null && l['paksa'] != true && pk.isEmpty && ft.isEmpty &&
          teksWo(petaWo(l['selesai'])['status']) != 'VERIFIKASI' && teksWo(petaWo(l['selesai'])['status']) != HartekLokal.gagal;
      if (kosong && (n != null || l['klaim'] != true)) lokal.remove(id);
    }
    d['kabar'] = kabar;
    return (buang: buang, fotoBuang: fotoBuang, selesaiUlang: ulang);
  }

  static Map<String, dynamic>? _pekerjaanServer(Map<String, dynamic>? n, String tlId) {
    for (final p in daftarWo(n?['pekerjaanWo'])) {
      if (teksWo(p['tlId']) == tlId) return p;
    }
    return null;
  }

  /// Daftar WO untuk layar: server + isian HP. Tanda tambahan (diawali '_'):
  ///  _lokalMulai  mulai belum terkirim        _konflik  kode WO bukan milik tim lagi (kartu pilihan)
  ///  _klaim       tetap diunggah (WO ganda)   _selesai  {status LOKAL / GAGAL / VERIFIKASI / TERKIRIM, galat}
  ///  _tunda       jumlah isian belum terkirim
  /// Pekerjaan HP: _lokal = true, _sinkron / _galat; foto HP di kunci HartekLokal (fotoLokal, _fotoSinkron, _fotoGalat).
  static List<Map<String, dynamic>> gabung(Map<String, dynamic> d) {
    final lokal = peta(salin({'l': d['lokal'] ?? const {}}), 'l');
    final hasil = <Map<String, dynamic>>[];
    final dilihat = <String>{};
    for (final t0 in woServer(d)) {
      final id = teksWo(t0['temuanId']);
      final g = petaWo(petaWo(t0['wo'])['ganda']);
      if (teksWo(g['status']) == 'DITOLAK' && g['pemilik'] != true) continue;
      dilihat.add(id);
      hasil.add(_tempel(Map<String, dynamic>.from(t0), lokal[id] is Map ? Map<String, dynamic>.from(lokal[id] as Map) : null));
    }
    for (final e in lokal.entries) {
      if (dilihat.contains(e.key) || e.value is! Map) continue;
      final l = Map<String, dynamic>.from(e.value as Map);
      final node = petaWo(l['node']);
      if (node.isEmpty) continue;
      hasil.add(_tempel(Map<String, dynamic>.from(node), l));
    }
    return hasil;
  }

  static Map<String, dynamic> _tempel(Map<String, dynamic> t, Map<String, dynamic>? l) {
    if (l == null) return t;
    final wo = {...petaWo(t['wo'])};
    if (l['mulai'] == true && teksWo(wo['status']) == StatusWo.terkirim) {
      wo['status'] = StatusWo.dikerjakan;
      t['_lokalMulai'] = true;
    }
    if (l['klaim'] == true || l['paksa'] == true) {
      t['_klaim'] = true;
      if (teksWo(wo['status']) != StatusWo.selesai) wo['status'] = StatusWo.dikerjakan;
    }
    if (l['konflik'] != null) t['_konflik'] = teksWo(l['konflik']);
    if (l['selesai'] is Map) t['_selesai'] = l['selesai'];
    t['wo'] = wo;
    final hapus = teks(l['hapus']).toSet();
    final fotoHp = petaWo(l['foto']);
    final fotoKirim = petaWo(l['fotoTerkirim']);
    var tunda = 0;
    Map<String, dynamic> tempelFoto(Map<String, dynamic> p) {
      final tlId = teksWo(p['tlId']);
      final f = petaWo(fotoHp[tlId]);
      final srv = {...petaWo(p['foto'])};
      for (final e in fotoKirim.entries) {
        if (e.key.startsWith('$tlId#')) srv[e.key.substring(tlId.length + 1)] = e.value;
      }
      tunda += f.length;
      return {
        ...p,
        'foto': srv,
        HartekLokal.fotoLokal: {for (final e in f.entries) e.key: teksWo(petaWo(e.value)['path'])},
        HartekLokal.fotoSinkron: {for (final e in f.entries) e.key: teksWo(petaWo(e.value)['status'])},
        HartekLokal.fotoGalat: {for (final e in f.entries) if (teksWo(petaWo(e.value)['galat']).isNotEmpty) e.key: teksWo(petaWo(e.value)['galat'])},
      };
    }

    final pk = <Map<String, dynamic>>[];
    final adaSrv = <String>{};
    for (final p in daftarWo(t['pekerjaanWo'])) {
      final tlId = teksWo(p['tlId']);
      if (hapus.contains(tlId)) continue;
      adaSrv.add(tlId);
      pk.add(tempelFoto(p));
    }
    final lp = petaWo(l['pekerjaan']).values.whereType<Map<dynamic, dynamic>>().map((x) => Map<String, dynamic>.from(x)).toList()
      ..sort((a, b) => teksWo(a['dibuat']).compareTo(teksWo(b['dibuat'])));
    for (final x in lp) {
      final tlId = teksWo(x['tlId']);
      if (adaSrv.contains(tlId)) continue;
      final srv = petaWo(x['server']);
      if (x['status'] != 'TERKIRIM') tunda++;
      pk.add(tempelFoto({
        ...petaWo(x['tampil']),
        ...srv,
        'tlId': tlId,
        'status': 'DRAFT',
        '_lokal': true,
        HartekLokal.sinkron: x['status'] == 'TERKIRIM' ? null : teksWo(x['status']),
        if (teksWo(x['galat']).isNotEmpty) HartekLokal.galat: teksWo(x['galat']),
      }));
    }
    t['pekerjaanWo'] = pk;
    if (l['mulai'] == true) tunda++;
    final sel = petaWo(l['selesai']);
    if (sel['status'] == HartekLokal.lokal || sel['status'] == HartekLokal.gagal) tunda++;
    t['_tunda'] = tunda;
    return t;
  }
}
