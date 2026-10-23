import 'dart:convert';

import 'package:http/http.dart' as http;

import 'env.dart';
import 'kode_error.dart';
import 'kunci_update.dart';
import 'versi.dart';

class ApiException implements Exception {
  ApiException(this.kode, {this.kolom});
  final String kode;

  /// v0.72.0: nama kolom isian yang ditolak validasi server (mis. tahunPhb). null = bukan error validasi.
  final String? kolom;
  @override
  String toString() => 'ApiException($kode)';
}

/// Satu-satunya pintu ke backend. Semua request: POST JSON {action, token, data}.
/// Respons: {ok, env, data} atau {ok:false, kode}.
class ApiClient {
  ApiClient({http.Client? client}) : _client = client ?? http.Client();
  final http.Client _client;

  /// v0.62.4: dipanggil sekali untuk tiap respons "sesi habis" dari panggilan bertoken, dari layar MANA PUN
  /// (dulu hanya lewat SyncController, yang tidak jalan untuk admin, jadi admin tidak pernah dilempar ke login).
  /// v0.62.6: ikut token panggilan itu, supaya jawaban terlambat dari sesi lama tidak mengakhiri / menahan sesi baru.
  void Function(String kode, String token)? onSesiHabis;

  /// v0.64.2: jam server dari setiap jawaban (`waktu`) = patokan jam terpercaya (JamTerpercaya.setelServer).
  void Function(DateTime waktuServer)? onWaktuServer;

  /// v0.81.0: versi backend terakhir dari jawaban server; berubah = [onVersiServer] (HP cek update).
  String? versiServer;
  void Function(String versi)? onVersiServer;

  /// v1.0.22: revisi master dari jawaban server (ADMIN_lengkapiMaster); berubah = HP mengunduh ulang Master Data + Gardu.
  void Function(String revisi)? onMasterServer;

  static const _hostRedirect = {'script.googleusercontent.com', 'script.google.com'};

  Future<Map<String, dynamic>> call(
    String action, {
    String? token,
    Map<String, dynamic> data = const {},
    Duration timeout = const Duration(seconds: 60), // Apps Script ~3-9 s per panggilan (keputusan 3 Okt 2026)
  }) async {
    // v1.0.22: aplikasi wajib update dan kartu update ditutup = data tidak dikirim (tetap aman di HP), baca tetap boleh
    if (KunciUpdate.aktif.value && !KunciUpdate.bolehAksi(action)) throw ApiException('UPDATE_APLIKASI_DULU');
    final req = http.Request('POST', Uri.parse(Env.apiUrl))
      ..followRedirects = false
      ..headers['Content-Type'] = 'application/json'
      // v0.81.1: versiApp ikut di setiap panggilan (server bisa menolak app di bawah versi minimum)
      ..body = jsonEncode({'action': action, if (token != null) 'token': token, 'data': data, 'versiApp': versiApp});

    var res = await http.Response.fromStream(await _client.send(req).timeout(timeout));

    // Apps Script menjawab POST dengan 302 ke googleusercontent; lanjutkan sebagai GET.
    if (res.statusCode == 302 || res.statusCode == 303) {
      final lokasi = res.headers['location'];
      final uri = lokasi == null ? null : Uri.tryParse(lokasi);
      if (uri == null || uri.scheme != 'https' || !_hostRedirect.contains(uri.host)) {
        throw ApiException('REDIRECT_TIDAK_DIIZINKAN');
      }
      res = await _client.get(uri).timeout(timeout);
    }
    if (res.statusCode != 200) throw ApiException('HTTP_${res.statusCode}');

    Object? json;
    try {
      json = jsonDecode(res.body);
    } catch (_) {
      throw ApiException('RESPON_BUKAN_JSON');
    }
    if (json is! Map<String, dynamic>) throw ApiException('RESPON_TIDAK_VALID');
    final waktu = json['waktu'];
    if (waktu is String && json['env'] == Env.name) {
      final w = DateTime.tryParse(waktu);
      if (w != null) onWaktuServer?.call(w);
    }
    final versi = json['versi'];
    if (versi is String && json['env'] == Env.name && versi != versiServer) {
      versiServer = versi;
      onVersiServer?.call(versi);
    }
    final master = json['master'];
    if (master is String && master.isNotEmpty && json['env'] == Env.name) onMasterServer?.call(master);
    if (json['ok'] != true) {
      final kode = (json['kode'] as String?) ?? 'GAGAL';
      if (token != null && KodeError.sesiHabis.contains(kode)) onSesiHabis?.call(kode, token);
      final kolom = json['kolom'];
      throw ApiException(kode, kolom: kolom is String && kolom.isNotEmpty ? kolom : null);
    }
    if (json['env'] != Env.name) throw ApiException('ENV_TIDAK_COCOK'); // APK staging nyambung ke production = tolak
    final isi = json['data'];
    return isi is Map<String, dynamic> ? isi : <String, dynamic>{};
  }
}
