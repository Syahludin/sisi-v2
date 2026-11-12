import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

import '../../core/api_client.dart';
import '../../core/sesi.dart';
import '../hartek/foto_lapangan.dart';
import '../tiang/tiang_api.dart';
import 'switching_model.dart';

/// Hasil simpan switching: baris dari server + foto yang gagal diunggah (hanya jalur mundur Apps Script; di Hostinger foto satu paket dengan data).
class HasilSimpanSwitching {
  const HasilSimpanSwitching(this.switching, [this.fotoGagal = const []]);
  final Switching switching;
  final List<String> fotoGagal;
}

/// 1.0.63 Master Switching: pintu ke server tiang (getMasterSwitching / simpanSwitching / uploadFotoSwitching / getFotoSwitching lewat
/// [TiangApi]: Hostinger, atau Apps Script bila alamat API tiang kosong). Master Jaringan (section / penyulang) tetap Apps Script.
/// Daftar terakhir disimpan di HP per akun, jadi peta + daftar tetap terbaca tanpa sinyal. Simpan + foto langsung ke server
/// (butuh sinyal): verifikasi Admin langsung berlaku, jadi tidak ada antrean yang bisa bentrok dengan Admin lain.
class SwitchingRepository {
  SwitchingRepository(this._api, this._tiang);
  final ApiClient _api;
  final TiangApi _tiang;

  static const menu = 'OPS_MASTER_SWITCHING';
  static const _batasFoto = Duration(seconds: 90);

  static bool boleh(Sesi s) => (s.role == 'ADMIN' || s.role == 'SUPER') && s.aksiMenu(menu) != null;
  static bool bolehUbah(Sesi s) => boleh(s) && s.aksiMenu(menu) == 'UBAH';

  Future<File> _berkas(Sesi s) async {
    final dir = Directory(p.join((await getApplicationDocumentsDirectory()).path, 'master_switching'));
    if (!dir.existsSync()) await dir.create(recursive: true);
    final aman = s.userId.replaceAll(RegExp(r'[^0-9A-Za-z_-]'), '');
    return File(p.join(dir.path, 'switching_$aman.json'));
  }

  /// Simpanan lokal terakhir (null = belum pernah / rusak).
  Future<DataSwitching?> lokal(Sesi s) async {
    try {
      final f = await _berkas(s);
      if (!f.existsSync()) return null;
      final j = jsonDecode(await f.readAsString());
      return j is Map ? DataSwitching.dariJson(Map<String, dynamic>.from(j)) : null;
    } catch (_) {
      return null;
    }
  }

  Future<void> _tulis(Sesi s, DataSwitching d) async {
    try {
      final f = await _berkas(s);
      final tmp = File('${f.path}.tmp');
      await tmp.writeAsString(jsonEncode(d.json), flush: true);
      await tmp.rename(f.path);
    } catch (_) {
      // simpanan lokal hanya pelengkap; gagal tulis tidak menggagalkan layar
    }
  }

  /// Muat dari server lalu simpan di HP.
  Future<DataSwitching> muat(Sesi s) async {
    final d = DataSwitching.dariJson(await _tiang.panggil(s, 'getMasterSwitching', const {}, timeout: const Duration(seconds: 60)));
    await _tulis(s, d);
    return d;
  }

  /// Simpan (baru / ubah). Hostinger: satu paket data + [foto] ({slot: path}) dengan [opId] (kirim ulang opId yang sama = tanpa data ganda,
  /// dipakai tombol "Coba Lagi"); foto rusak / hilang menggagalkan seluruh paket. Jalur mundur: data dulu, lalu foto satu per satu.
  /// Simpanan lokal ikut diperbarui.
  Future<HasilSimpanSwitching> simpan(Sesi s, IsianSwitching i, {DataSwitching? data, Map<String, String> foto = const {}, String? opId}) async {
    final id = opId ?? const Uuid().v4();
    final gagal = <String>[];
    Switching sw;
    if (_tiang.aktif) {
      final paket = <String, dynamic>{};
      for (final e in foto.entries) {
        final bytes = await FotoLapangan.baca(e.value);
        if (bytes == null || bytes.isEmpty) throw ApiException('FOTO_HILANG');
        paket[e.key] = FotoLapangan.isiKirim(bytes);
      }
      final j = await _tiang.panggil(s, 'simpanSwitching', {...i.payload(), 'opId': id, if (paket.isNotEmpty) 'foto': paket}, timeout: const Duration(seconds: 90));
      sw = Switching.dariJson(Map<String, dynamic>.from(j['switching'] as Map));
    } else {
      final j = await _tiang.panggil(s, 'simpanSwitching', i.payload(), timeout: const Duration(seconds: 60));
      sw = Switching.dariJson(Map<String, dynamic>.from(j['switching'] as Map));
      for (final e in foto.entries) {
        try {
          await unggahFoto(s, sw.id, e.key, e.value);
          sw = sw.salin({'foto': {...?(sw.d['foto'] as Map?)?.cast<String, dynamic>(), e.key: true}});
        } catch (_) {
          gagal.add(e.key);
        }
      }
    }
    if (data != null) await _tulis(s, data.ganti(sw));
    return HasilSimpanSwitching(sw, gagal);
  }

  /// Kirim satu foto susulan (path JPEG kamera SiSi) ke slot UNIT / NAMEPLATE / KONTROLER. Hostinger: dengan opId, tanpa menaikkan revision.
  Future<void> unggahFoto(Sesi s, String switchingId, String slot, String path, {String? opId}) async {
    final bytes = await FotoLapangan.baca(path);
    if (bytes == null) throw ApiException('FOTO_HILANG');
    await _tiang.panggil(s, 'uploadFotoSwitching',
        {'switchingId': switchingId, 'slot': slot, if (_tiang.aktif) 'opId': opId ?? const Uuid().v4(), ...FotoLapangan.isiKirim(bytes)},
        timeout: _batasFoto);
  }

  /// Foto dari server (KECIL = thumbnail). Hasil = bytes JPEG.
  Future<List<int>> foto(Sesi s, String switchingId, String slot, {bool penuh = false}) async {
    final j = await _tiang.panggil(s, 'getFotoSwitching', {'switchingId': switchingId, 'slot': slot, 'ukuran': penuh ? 'PENUH' : 'KECIL'}, timeout: _batasFoto);
    return base64Decode('${j['data'] ?? ''}');
  }

  /// getJaringan: semua section (termasuk nonaktif) untuk tab Jaringan.
  Future<List<Map<String, dynamic>>> jaringan(Sesi s) async {
    final j = await _api.call('getJaringan', token: s.token, data: const {}, timeout: const Duration(seconds: 60));
    return [for (final x in (j['section'] as List? ?? const []).whereType<Map<dynamic, dynamic>>()) Map<String, dynamic>.from(x)];
  }

  Future<void> simpanSection(Sesi s, Map<String, dynamic> isi) => _api.call('simpanSection', token: s.token, data: isi, timeout: const Duration(seconds: 60));

  Future<void> setAktifPenyulang(Sesi s, String penyulang, bool aktif) =>
      _api.call('setAktifPenyulang', token: s.token, data: {'penyulang': penyulang, 'aktif': aktif}, timeout: const Duration(seconds: 60));
}
