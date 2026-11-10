import '../../core/api_client.dart';
import '../../core/sesi.dart';

/// v0.88.0: API Hartek untuk HP (online saja, belum ada cache / antrean lokal).
/// Semua panggilan memakai token sesi; server memeriksa menu OPS_HARTEK_INPUT dan jenis tim HARTEK.
class HartekRepository {
  HartekRepository(this._api, this._sesi);

  final ApiClient _api;
  final Sesi _sesi;

  static const menu = 'OPS_HARTEK_INPUT';

  Future<Map<String, dynamic>> _call(String aksi, [Map<String, dynamic> data = const {}]) =>
      _api.call(aksi, token: _sesi.token, data: data);

  Future<Map<String, dynamic>> harian() => _call('getHartekHarian');
  Future<Map<String, dynamic>> jaringan() => _call('getJaringanHartek');
  Future<Map<String, dynamic>> material() => _call('getMaterialHartek');
  Future<Map<String, dynamic>> jenisPekerjaan() => _call('getJenisPekerjaanHartek');   // v0.91.0
  Future<Map<String, dynamic>> buatHeader(Map<String, dynamic> d) => _call('buatHeaderHartek', d);
  Future<Map<String, dynamic>> ubahHeader(Map<String, dynamic> d) => _call('ubahHeaderHartek', d);
  Future<Map<String, dynamic>> simpanPg(Map<String, dynamic> d) => _call('simpanPgHartek', d);
  Future<Map<String, dynamic>> simpanPekerjaan(Map<String, dynamic> d) => _call('simpanPekerjaanHartek', d);
  Future<Map<String, dynamic>> ubahPekerjaan(Map<String, dynamic> d) => _call('ubahPekerjaanHartek', d);   // v0.97.0
  Future<Map<String, dynamic>> simpanMaterial(Map<String, dynamic> d) => _call('simpanMaterialHartek', d);
  Future<Map<String, dynamic>> simpanGrounding(Map<String, dynamic> d) => _call('simpanGroundingHartek', d);
  Future<Map<String, dynamic>> simpanPemerataan(Map<String, dynamic> d) => _call('simpanPemerataanHartek', d);

  /// v0.94.0: pilihan pekerjaan untuk satu lokasi. Master berjenis sama dengan lokasi + master tanpa jenis (semua jenis);
  /// nama kembar = baris berjenis sama didahulukan (sama dengan server, kunci pekerjaan||jenis v1). Urutan master dijaga.
  static Map<String, Map<String, dynamic>> pekerjaanUntukJenis(List<Map<String, dynamic>> master, String jenisPg) {
    String t(Object? v) => v?.toString().trim() ?? '';
    final hasil = <String, Map<String, dynamic>>{};
    for (final j in master) {
      final nama = t(j['nama']), jenis = t(j['jenisPekerjaan']);
      if (nama.isEmpty || t(j['jenisId']).isEmpty) continue;
      if (jenis.isNotEmpty && jenis != jenisPg) continue;
      final ada = hasil[nama];
      if (ada == null || (t(ada['jenisPekerjaan']).isEmpty && jenis == jenisPg)) hasil[nama] = j;
    }
    return hasil;
  }

  /// v0.97.0 (Master Guswan 15 Okt 2026): rincian grounding hanya untuk pekerjaan yang namanya mengandung "grounding"
  /// (aturan sama dengan server: groundingBolehHartek_).
  static bool groundingBoleh(String namaPekerjaan) => namaPekerjaan.toLowerCase().contains('grounding');

  /// v1.0.38 (keputusan Master Guswan 27 Okt 2026): pekerjaan yang WAJIB punya hasil grounding sebelum laporan dikirim ke WA.
  /// Hanya aturan HP untuk petugas (server tetap menerima). Pasang / Perbaikan Grounding TR dan Grounding Rod
  /// tidak termasuk.
  static const _groundingWajib = {
    'pemasangan grounding arrester trafo', 'pemasangan grounding body trafo', 'perbaikan grounding arrester trafo', 'perbaikan grounding body trafo',
    'pemasangan grounding arrester', 'pemasangan grounding cld', 'pemasangan grounding gsw', 'pemasangan grounding igsw',
    'pemasangan grounding lbs motorized', 'pemasangan grounding recloser', 'pemasangan grounding surge arrester',
    'perbaikan grounding arrester jaringan', 'perbaikan grounding cld', 'perbaikan grounding gsw', 'perbaikan grounding igsw',
    'perbaikan grounding lbs motorized', 'perbaikan grounding recloser', 'perbaikan grounding surge arrester',
  };
  static bool groundingWajib(String namaPekerjaan) =>
      _groundingWajib.contains(namaPekerjaan.trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' '));

  /// "Pasang Grounding" = grounding baru, jadi hanya ada nilai SESUDAH. Perbaikan = sebelum + sesudah.
  static bool groundingHanyaSesudah(String namaPekerjaan) {
    final n = namaPekerjaan.toLowerCase();
    return n.contains('grounding') && n.contains('pasang');
  }

  /// v0.98.11: nama peralatan hasil grounding dari lokasi pekerjaan:
  /// - Jaringan: nama switching sesuai section di penyulang tersebut (bagian depan section sebelum " - ").
  /// - Gardu (atau Non-Teknik bergardu): nomor gardu.
  static String namaPeralatanGrounding({required String jenisPekerjaan, String section = '', String noGardu = ''}) {
    final j = jenisPekerjaan.trim().toLowerCase();
    if (j == 'jaringan') {
      final s = section.trim();
      final i = s.indexOf(' - ');
      return (i == -1 ? s : s.substring(0, i)).trim();
    }
    return noGardu.trim().toUpperCase();
  }

  /// Pemerataan hanya untuk pekerjaan ini (sama dengan aturan server).
  static bool pemerataanBoleh(String namaPekerjaan) =>
      const {'pemerataan beban gardu', 'pembagian beban gardu'}.contains(namaPekerjaan.trim().toLowerCase());

  /// v0.89.0: selisih beban antar fasa dalam persen = (maks - min) / rata-rata x 100.
  /// null kalau R / S / T belum lengkap atau rata-rata 0.
  static double? ketidakseimbangan(List<num?> fasa) {
    final x = fasa.whereType<num>().toList();
    if (x.length != 3) return null;
    final rata = (x[0] + x[1] + x[2]) / 3;
    if (rata <= 0) return null;
    final maks = x.reduce((a, b) => a > b ? a : b);
    final min = x.reduce((a, b) => a < b ? a : b);
    return (maks - min) / rata * 100;
  }
}
