import '../../core/api_client.dart';
import '../../core/sesi.dart';
import '../hartek/foto_lapangan.dart';
import 'gudang_model.dart';

/// v1.0.57 Gudang Material: pintu ke backend untuk layar Yandal (Stok Material, menu OPS_STOK_MATERIAL) dan admin
/// (Material Gudang, menu OPS_GUDANG_MATERIAL). Semua tulis langsung ke server (butuh sinyal, tanpa antrean offline: keputusan Master Guswan).
/// Server menegakkan peran, tim (dari sesi), izin material, dan stok; HP hanya merapikan isian.
class GudangRepository {
  GudangRepository(this._api);
  final ApiClient _api;

  static const menuAdmin = 'OPS_GUDANG_MATERIAL';
  static const menuYandal = 'OPS_STOK_MATERIAL';
  static const _batasFoto = Duration(seconds: 90);

  static bool bolehAdmin(Sesi s) => (s.role == 'ADMIN' || s.role == 'SUPER') && s.aksiMenu(menuAdmin) != null;
  static bool bolehUbahAdmin(Sesi s) => bolehAdmin(s) && s.aksiMenu(menuAdmin) == 'UBAH';
  static bool bolehYandal(Sesi s) => s.petugasYandal && s.aksiMenu(menuYandal) != null;
  static bool bolehUbahYandal(Sesi s) => bolehYandal(s) && s.aksiMenu(menuYandal) == 'UBAH';

  Future<Map<String, dynamic>> _panggil(Sesi s, String aksi, Map<String, dynamic> data, {Duration? batas}) =>
      _api.call(aksi, token: s.token, data: data, timeout: batas ?? const Duration(seconds: 60));

  /// Foto dari HP -> isian kirim (sha256 + ukuran + base64). File hilang = FOTO_HILANG (ambil ulang).
  static Future<Map<String, dynamic>> _foto(String path) async {
    final bytes = await FotoLapangan.baca(path);
    if (bytes == null) throw ApiException('FOTO_HILANG');
    return FotoLapangan.isiKirim(bytes);
  }

  // ---------------- Yandal ----------------

  Future<StokYandal> stok(Sesi s) async => StokYandal.dariJson(await _panggil(s, 'getStokYandal', const {}));

  Future<HasilPemeriksaan> simpanPemeriksaan(Sesi s, List<EntriMcb> entri, String fotoPath) async {
    final d = await _panggil(s, 'simpanPemeriksaanStok', {'item': [for (final e in entri) e.json], 'foto': await _foto(fotoPath)}, batas: _batasFoto);
    return HasilPemeriksaan.dariJson(d);
  }

  /// Hasil: nomor pemakaian (Kode Shift diikuti -MCB.nnn).
  Future<String> simpanPemakaian(Sesi s, PemakaianBaru p) async {
    final d = await _panggil(
        s,
        'simpanPemakaianMcb',
        {
          'pemakaianId': p.pemakaianId,
          'daya': p.daya,
          'merk': p.merk,
          'statusMcb': p.statusMcb,
          'nomorMeter': p.nomorMeter,
          'keperluan': p.keperluan,
          'foto': await _foto(p.fotoPath),
        },
        batas: _batasFoto);
    return '${d['nomorPemakaian'] ?? ''}';
  }

  Future<String> simpanSusulan(Sesi s, {required String pemakaianId, required String selisihId, required String nomorMeter, required String keperluan}) async {
    final d = await _panggil(s, 'simpanPemakaianSusulan', {'pemakaianId': pemakaianId, 'selisihId': selisihId, 'nomorMeter': nomorMeter, 'keperluan': keperluan});
    return '${d['nomorPemakaian'] ?? ''}';
  }

  // ---------------- Admin ----------------

  Future<StokGudang> stokGudang(Sesi s) async => StokGudang.dariJson(await _panggil(s, 'getGudangStok', const {}));

  /// {material: [{materialId, nama, satuan}], tim: [{timId, nama, jenis}], izin: [{materialId, timId, aktif}]}
  Future<Map<String, dynamic>> izin(Sesi s) => _panggil(s, 'getIzinMaterial', const {});

  Future<Map<String, dynamic>> simpanIzin(Sesi s, String materialId, List<String> timIds) =>
      _panggil(s, 'simpanIzinMaterial', {'materialId': materialId, 'timIds': timIds});

  /// aksi: tambahStokGudang | kirimStokTim | tarikStokTim | koreksiStok. [isi] = payload (idOperasi sudah ada di dalamnya).
  Future<Map<String, dynamic>> ubahStok(Sesi s, String aksi, Map<String, dynamic> isi) => _panggil(s, aksi, isi);

  Future<List<SelisihStok>> selisih(Sesi s, {String? status}) async {
    final d = await _panggil(s, 'getSelisihGudang', {if (status != null) 'status': status});
    return [for (final x in (d['selisih'] as List? ?? const []).whereType<Map<dynamic, dynamic>>()) SelisihStok.dariJson(Map<String, dynamic>.from(x))];
  }

  /// {selisih, susulan, dikoreksi} mentah (daftar susulan / dikoreksi untuk diperiksa admin).
  Future<Map<String, dynamic>> selisihLengkap(Sesi s, {String? status}) => _panggil(s, 'getSelisihGudang', {if (status != null) 'status': status});

  Future<Map<String, dynamic>> selesaikanSelisih(Sesi s, Map<String, dynamic> isi) => _panggil(s, 'selesaikanSelisih', isi);

  Future<List<Map<String, dynamic>>> pemakaian(Sesi s, {required String dari, required String sampai}) async {
    final d = await _panggil(s, 'getPemakaianGudang', {'dari': dari, 'sampai': sampai});
    return [for (final x in (d['pemakaian'] as List? ?? const []).whereType<Map<dynamic, dynamic>>()) Map<String, dynamic>.from(x)];
  }

  Future<Map<String, dynamic>> koreksiPemakaian(Sesi s, Map<String, dynamic> isi) => _panggil(s, 'koreksiPemakaian', isi);
  Future<Map<String, dynamic>> batalkanPemakaian(Sesi s, Map<String, dynamic> isi) => _panggil(s, 'batalkanPemakaian', isi);
}
