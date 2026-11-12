import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../core/api_client.dart';
import '../../core/kunci_update.dart';
import '../../core/sesi.dart';
import '../hartek/hartek_store.dart' show GudangHartek;
import 'tiket_tiang.dart';

/// Satu masalah isian dari server (422): [field] = kunci form HP (jenis, ukuran, sisi, foto, posisi, sirkuit<i>, ...).
typedef GalatIsian = ({String field, String pesan});

/// Server menolak isian (422 DATA_TIDAK_VALID): SEMUA masalah sekaligus. [kolom] = isian pertama, supaya layar bisa menggulir ke sana.
class GalatValidasi extends ApiException {
  GalatValidasi(this.galat) : super('DATA_TIDAK_VALID', kolom: galat.isEmpty ? null : galat.first.field);
  final List<GalatIsian> galat;

  @override
  String toString() => 'GalatValidasi(${galat.map((g) => g.field).join(',')})';
}

/// Alamat API tiang (`ping` -> versi.tiangApi) yang diingat di HP: tanpa sinyal pun HP tahu harus memakai Hostinger (atau jalur lama).
/// Kosong = jalur Apps Script lama (jalur mundur). Info dari server selalu menang; disimpan agar start tanpa sinyal tidak keliru.
class AlamatTiang {
  AlamatTiang(this._gudang);
  final GudangHartek _gudang;
  static const kunci = 'tiang_api_url';
  String _nilai = '';

  String get nilai => _nilai;

  Future<void> muat() async {
    try {
      final r = await _gudang.bacaMaster(kunci);
      if (r != null) _nilai = _bersih(jsonDecode(r.json));
    } catch (_) {
      _nilai = '';
    }
  }

  /// Dipanggil bila `ping` memberi info baru ('' = fitur dimatikan di server).
  Future<void> perbarui(String? dariServer) async {
    if (dariServer == null) return;
    final baru = _bersih(dariServer);
    if (baru == _nilai) return;
    _nilai = baru;
    try {
      await _gudang.tulisMaster(kunci, jsonEncode(baru));
    } catch (_) {/* hanya pengingat: server tetap sumber */}
  }

  static String _bersih(Object? v) {
    final s = '${v ?? ''}'.trim().replaceAll(RegExp(r'/+$'), '');
    return s.startsWith('https://') ? s : '';
  }
}

/// Pintu ke API tiang di Hostinger (`<alamat>/tiang.php`, POST {action, data}, header X-SiSi-Tiket).
/// - Alamat kosong = diteruskan ke [lama] (Apps Script), jadi kode pemanggil sama di kedua jalur.
/// - Tiket kedaluwarsa / ditolak = minta tiket baru SEKALI lalu ulangi.
/// - 422 -> [GalatValidasi]; galat lain -> ApiException(kode). Galat jaringan / waktu habis dilempar apa adanya (pemanggil menyimpan draf).
class TiangApi {
  TiangApi({required String Function() alamat, required TiketTiang tiket, required ApiClient lama, http.Client? client})
      : _alamat = alamat,
        _tiket = tiket,
        _lama = lama,
        _klien = client ?? http.Client();

  final String Function() _alamat;
  final TiketTiang _tiket;
  final ApiClient _lama;
  final http.Client _klien;

  /// true = HP memakai Hostinger.
  bool get aktif => _alamat().isNotEmpty;

  Future<Map<String, dynamic>> panggil(Sesi s, String aksi, Map<String, dynamic> data, {Duration timeout = const Duration(seconds: 30)}) async {
    // aplikasi wajib update dan kartu update ditutup = tulis tidak dikirim (sama dengan ApiClient)
    if (KunciUpdate.aktif.value && !KunciUpdate.bolehAksi(aksi)) throw ApiException('UPDATE_APLIKASI_DULU');
    final dasar = _alamat();
    if (dasar.isEmpty) return _lama.call(aksi, token: s.token, data: data, timeout: timeout);
    for (var coba = 0;; coba++) {
      final tiket = await _tiket.tiket(s, paksa: coba > 0);
      final res = await _klien
          .post(Uri.parse('$dasar/tiang.php'), headers: {'Content-Type': 'application/json', 'X-SiSi-Tiket': tiket}, body: jsonEncode({'action': aksi, 'data': data}))
          .timeout(timeout);
      final json = _urai(res);
      final kode = json == null ? null : '${json['kode'] ?? ''}';
      if (res.statusCode == 401 && coba == 0 && (kode == 'TIKET_KEDALUWARSA' || kode == 'TIKET_TIDAK_VALID')) continue;
      return _selesai(res.statusCode, json);
    }
  }

  static Map<String, dynamic>? _urai(http.Response res) {
    try {
      final j = jsonDecode(res.body);
      return j is Map<String, dynamic> ? j : null;
    } catch (_) {
      return null;
    }
  }

  static Map<String, dynamic> _selesai(int status, Map<String, dynamic>? json) {
    if (json == null) throw ApiException(status == 200 ? 'RESPON_BUKAN_JSON' : 'HTTP_$status');
    if (json['ok'] == true) {
      final isi = json['data'];
      return isi is Map<String, dynamic> ? isi : <String, dynamic>{};
    }
    final galat = json['galat'];
    if (status == 422 && galat is List) {
      throw GalatValidasi([for (final g in galat.whereType<Map<dynamic, dynamic>>()) (field: '${g['field'] ?? ''}', pesan: '${g['pesan'] ?? ''}')]);
    }
    final kode = '${json['kode'] ?? 'GAGAL'}';
    // TIKET_TIDAK_VALID sudah dipakai alur pilih petugas Yandal dengan pesan lain: kode dari server tiang diberi nama sendiri
    throw ApiException(kode == 'TIKET_TIDAK_VALID' ? 'TIKET_TIANG_TIDAK_VALID' : kode);
  }
}
