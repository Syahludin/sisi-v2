import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../core/api_client.dart';
import '../../core/sesi.dart';
import '../hartek/foto_lapangan.dart';
import 'switching_model.dart';

/// 1.0.63 Master Switching: pintu ke backend (getMasterSwitching / simpanSwitching / uploadFotoSwitching / getFotoSwitching).
/// Daftar terakhir disimpan di HP per akun, jadi peta + daftar tetap terbaca tanpa sinyal. Simpan + foto langsung ke server
/// (butuh sinyal): verifikasi Admin langsung berlaku, jadi tidak ada antrean yang bisa bentrok dengan Admin lain.
class SwitchingRepository {
  SwitchingRepository(this._api);
  final ApiClient _api;

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
    final d = DataSwitching.dariJson(await _api.call('getMasterSwitching', token: s.token, data: const {}, timeout: const Duration(seconds: 60)));
    await _tulis(s, d);
    return d;
  }

  /// Simpan (baru / ubah). Hasil = baris dari server; simpanan lokal ikut diperbarui.
  Future<Switching> simpan(Sesi s, IsianSwitching i, {DataSwitching? data}) async {
    final j = await _api.call('simpanSwitching', token: s.token, data: i.payload(), timeout: const Duration(seconds: 60));
    final sw = Switching.dariJson(Map<String, dynamic>.from(j['switching'] as Map));
    if (data != null) await _tulis(s, data.ganti(sw));
    return sw;
  }

  /// Kirim satu foto (path JPEG kamera SiSi) ke slot UNIT / NAMEPLATE / KONTROLER.
  Future<void> unggahFoto(Sesi s, String switchingId, String slot, String path) async {
    final bytes = await FotoLapangan.baca(path);
    if (bytes == null) throw ApiException('FOTO_HILANG');
    await _api.call('uploadFotoSwitching',
        token: s.token, data: {'switchingId': switchingId, 'slot': slot, ...FotoLapangan.isiKirim(bytes)}, timeout: _batasFoto);
  }

  /// Foto dari server (KECIL = thumbnail). Hasil = bytes JPEG.
  Future<List<int>> foto(Sesi s, String switchingId, String slot, {bool penuh = false}) async {
    final j = await _api.call('getFotoSwitching',
        token: s.token, data: {'switchingId': switchingId, 'slot': slot, 'ukuran': penuh ? 'PENUH' : 'KECIL'}, timeout: _batasFoto);
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
