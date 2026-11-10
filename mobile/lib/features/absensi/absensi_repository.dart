import '../../core/api_client.dart';
import '../../core/sesi.dart';
import 'absensi_model.dart';

/// v1.0.51: baca absensi hari ini (staf per tim + isian rekan + teks WhatsApp). Simpan lewat [AntreanAbsensi] (latar belakang).
class AbsensiRepository {
  AbsensiRepository(this._api);
  final ApiClient _api;

  static const menu = 'OPS_ABSENSI';

  Future<DataAbsensi> muat(Sesi s) async => DataAbsensi.dariJson(await _api.call('getAbsensi', token: s.token, data: const {}));
}
