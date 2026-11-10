import '../../core/api_client.dart';
import 'wo_selisih.dart';
import 'wo_simpanan.dart';

/// v1.0.58: daftar WO admin dari data lokal + sinkron selisih (rancangan docs/superpowers/specs/2026-11-04-penerusan-wo-offline-design.md).
///   1. Data lokal (bila ada) langsung diberikan lewat [tampilLokal].
///   2. Pembukaan pertama di peluncuran app ini = unduhan penuh (status SEMUA); sesudahnya hanya selisih (sejak = kursor terakhir).
///   3. Simpanan ditulis hanya sesudah panggilan sukses. Gagal / tanpa sinyal dengan data lokal = data lokal kembali
///      ([HasilSinkronWo.gagal] true); tanpa data lokal = galat asli dilempar.
/// Filter status dilakukan di HP (saringStatusWo), jadi permintaan selalu status SEMUA. Pasangannya di web: web/src/sinkronWo.js.

/// Penyimpanan yang dipakai [sinkronDaftarWo]; bawaan = [SimpananWo]. Tes menyuntik pengganti.
class StoreWo {
  const StoreWo({
    this.baca = SimpananWo.baca,
    this.tulis = SimpananWo.tulis,
    this.sudahPenuh = SimpananWo.sudahPenuh,
    this.tandaiPenuh = SimpananWo.tandaiPenuh,
  });
  final Future<({Map<String, dynamic> data, int waktu})?> Function(String kunci) baca;
  final Future<void> Function(String kunci, Map<String, dynamic> data) tulis;
  final bool Function(String kunci) sudahPenuh;
  final void Function(String kunci) tandaiPenuh;
}

class HasilSinkronWo {
  const HasilSinkronWo(this.data, {this.gagal = false, this.waktuLokal});

  /// Data akhir (gabungan / penuh dari server; atau data lokal bila [gagal]).
  final Map<String, dynamic> data;

  /// true = server tidak terjangkau, [data] adalah simpanan lokal yang belum disegarkan.
  final bool gagal;

  /// Waktu simpan data lokal (ms) bila ada.
  final int? waktuLokal;
}

Future<HasilSinkronWo> sinkronDaftarWo({
  required String kunci,
  required String aksi,
  required Map<String, dynamic> param,
  required Future<Map<String, dynamic>> Function(String aksi, Map<String, dynamic> data) api,
  StoreWo store = const StoreWo(),
  void Function(Map<String, dynamic> data, int waktu)? tampilLokal,
  bool paksaPenuh = false,
}) async {
  final lokal = await store.baca(kunci);
  if (lokal != null) tampilLokal?.call(lokal.data, lokal.waktu);
  final kursor = lokal == null ? '' : '${lokal.data['kursor'] ?? ''}';
  final selisih = lokal != null && !paksaPenuh && store.sudahPenuh(kunci) && kursor.isNotEmpty;
  try {
    Map<String, dynamic> data;
    if (selisih) {
      final j = await api(aksi, {...param, 'status': 'SEMUA', 'sejak': kursor});
      data = gabungSelisihWo(lokal.data, j);
    } else {
      data = await api(aksi, {...param, 'status': 'SEMUA'});
      store.tandaiPenuh(kunci);
    }
    await store.tulis(kunci, data);
    return HasilSinkronWo(data, waktuLokal: lokal?.waktu);
  } catch (e) {
    // timeout / SocketException / HTTP_* / jawaban rusak: dengan data lokal sama dengan tanpa sinyal.
    // Penolakan server (mis. AKSES_DITOLAK) tetap dilempar supaya tidak tersembunyi di balik data lokal.
    final takTerjangkau = e is! ApiException || e.kode.startsWith('HTTP_') || e.kode == 'RESPON_BUKAN_JSON' || e.kode == 'RESPON_TIDAK_VALID';
    if (lokal != null && takTerjangkau) return HasilSinkronWo(lokal.data, gagal: true, waktuLokal: lokal.waktu);
    rethrow;
  }
}
