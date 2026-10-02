import 'dart:convert';

import 'package:http/http.dart' as http;

import 'env.dart';

class ApiException implements Exception {
  ApiException(this.kode);
  final String kode;
  @override
  String toString() => 'ApiException($kode)';
}

/// Satu-satunya pintu ke backend. Semua request: POST JSON {action, token, data}.
/// Respons: {ok, env, data} atau {ok:false, kode}.
class ApiClient {
  ApiClient({http.Client? client}) : _client = client ?? http.Client();
  final http.Client _client;

  static const _hostRedirect = {'script.googleusercontent.com', 'script.google.com'};

  Future<Map<String, dynamic>> call(
    String action, {
    String? token,
    Map<String, dynamic> data = const {},
    Duration timeout = const Duration(seconds: 30),
  }) async {
    final req = http.Request('POST', Uri.parse(Env.apiUrl))
      ..followRedirects = false
      ..headers['Content-Type'] = 'application/json'
      ..body = jsonEncode({'action': action, if (token != null) 'token': token, 'data': data});

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
    if (json['ok'] != true) throw ApiException((json['kode'] as String?) ?? 'GAGAL');
    if (json['env'] != Env.name) throw ApiException('ENV_TIDAK_COCOK'); // APK staging nyambung ke production = tolak
    final isi = json['data'];
    return isi is Map<String, dynamic> ? isi : <String, dynamic>{};
  }
}
