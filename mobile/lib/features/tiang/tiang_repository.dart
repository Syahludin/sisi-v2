import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../core/api_client.dart';
import '../../core/sesi.dart';
import '../hartek/foto_lapangan.dart';
import 'tiang_model.dart';

/// Verifikasi Tiang + Segmen: pintu ke backend. Pilihan isian dan tiap jalur terakhir disimpan di HP per akun (tetap terbaca tanpa
/// sinyal); simpan + foto langsung ke server (verifikasi Admin langsung berlaku).
class TiangRepository {
  TiangRepository(this._api);
  final ApiClient _api;

  static const menu = 'OPS_VERIFIKASI_TIANG';
  static bool boleh(Sesi s) => (s.role == 'ADMIN' || s.role == 'SUPER') && s.aksiMenu(menu) != null;
  static bool bolehUbah(Sesi s) => boleh(s) && s.aksiMenu(menu) == 'UBAH';

  Future<Map<String, dynamic>> _panggil(Sesi s, String aksi, Map<String, dynamic> data, {int detik = 60}) =>
      _api.call(aksi, token: s.token, data: data, timeout: Duration(seconds: detik));

  Future<File> _berkas(Sesi s, String nama) async {
    final dir = Directory(p.join((await getApplicationDocumentsDirectory()).path, 'verifikasi_tiang'));
    if (!dir.existsSync()) await dir.create(recursive: true);
    return File(p.join(dir.path, '${s.userId.replaceAll(RegExp(r'[^0-9A-Za-z_-]'), '')}_$nama.json'));
  }

  Future<Map<String, dynamic>?> _baca(Sesi s, String nama) async {
    try {
      final f = await _berkas(s, nama);
      if (!f.existsSync()) return null;
      final j = jsonDecode(await f.readAsString());
      return j is Map ? Map<String, dynamic>.from(j) : null;
    } catch (_) {
      return null;
    }
  }

  Future<void> _tulis(Sesi s, String nama, Map<String, dynamic> j) async {
    try {
      final f = await _berkas(s, nama), tmp = File('${f.path}.tmp');
      await tmp.writeAsString(jsonEncode(j), flush: true);
      await tmp.rename(f.path);
    } catch (_) {
      // simpanan lokal hanya pelengkap
    }
  }

  Future<PilihanTiang?> pilihanLokal(Sesi s) async {
    final j = await _baca(s, 'pilihan');
    return j == null ? null : PilihanTiang.dariJson(j);
  }

  Future<PilihanTiang> pilihan(Sesi s) async {
    final j = await _panggil(s, 'getVerifikasiTiang', const {});
    await _tulis(s, 'pilihan', j);
    return PilihanTiang.dariJson(j);
  }

  Future<List<Tiang>?> jalurLokal(Sesi s, String kode) async {
    final j = await _baca(s, 'jalur_$kode');
    return j == null ? null : [for (final x in (j['tiang'] as List? ?? const []).whereType<Map<dynamic, dynamic>>()) Tiang(Map<String, dynamic>.from(x))];
  }

  Future<List<Tiang>> jalur(Sesi s, String kode) async {
    final j = await _panggil(s, 'getTiangJalur', {'kode': kode}, detik: 90);
    await _tulis(s, 'jalur_$kode', j);
    return [for (final x in (j['tiang'] as List? ?? const []).whereType<Map<dynamic, dynamic>>()) Tiang(Map<String, dynamic>.from(x))];
  }

  /// Simpan verifikasi; daftar jalur lokal ikut diperbarui. Hasil: (tiang dari server, selisih meter dari koordinat aset).
  Future<(Tiang, num?)> simpan(Sesi s, IsianTiang i, {List<Tiang>? daftar}) async {
    final j = await _panggil(s, 'simpanVerifikasiTiang', i.payload(), detik: 90);
    final t = Tiang(Map<String, dynamic>.from(j['tiang'] as Map));
    if (daftar != null) {
      final baru = [for (final x in daftar) x.id == t.id ? t : x];
      if (!baru.any((x) => x.id == t.id)) baru.add(t);
      await _tulis(s, 'jalur_${t.teks('kode')}', {
        'kode': t.teks('kode'),
        'tiang': [for (final x in baru) x.json]
      });
    }
    return (t, j['selisihM'] as num?);
  }

  Future<void> unggahFoto(Sesi s, String tiangId, String slot, String path) async {
    final bytes = await FotoLapangan.baca(path);
    if (bytes == null) throw ApiException('FOTO_HILANG');
    await _panggil(s, 'uploadFotoTiang', {'tiangId': tiangId, 'slot': slot, ...FotoLapangan.isiKirim(bytes)}, detik: 90);
  }

  Future<List<int>> foto(Sesi s, String tiangId, String slot) async {
    final j = await _panggil(s, 'getFotoTiang', {'tiangId': tiangId, 'slot': slot, 'ukuran': 'KECIL'}, detik: 90);
    return base64Decode('${j['data'] ?? ''}');
  }

  /// getSegmen: {segmen, jaringan, switching}.
  Future<Map<String, dynamic>> segmen(Sesi s) => _panggil(s, 'getSegmen', const {});

  Future<Segmen> simpanSegmen(Sesi s, IsianSegmen i) async =>
      Segmen(Map<String, dynamic>.from((await _panggil(s, 'simpanSegmen', i.payload()))['segmen'] as Map));
}
