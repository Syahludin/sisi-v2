import '../../core/api_client.dart';
import '../../core/sesi.dart';

/// Tiket 8 jam untuk API tiang di Hostinger (docs/superpowers/specs/2026-11-11-tiang-hostinger-design.md S6). Diminta ke Apps Script
/// (`getTiketApi`), disimpan per akun, dan diperbarui saat sisa masa berlaku kurang dari [sisaMin].
/// - Beberapa pemanggil bersamaan memakai SATU permintaan.
/// - Gagal memperbarui (tanpa sinyal) tidak memutus kerja selama tiket lama belum kedaluwarsa.
/// - [paksa] (server menolak tiket) = minta baru; tiket lama tidak dipakai lagi.
class TiketTiang {
  TiketTiang(this._ambil, {DateTime Function()? sekarang, this.sisaMin = const Duration(minutes: 30)}) : _sekarang = sekarang ?? DateTime.now;

  /// Tiket dari `getTiketApi` jawaban Apps Script ({tiket, sampai ISO}).
  factory TiketTiang.dariApi(ApiClient api, {DateTime Function()? sekarang}) => TiketTiang((s) async {
        final d = await api.call('getTiketApi', token: s.token, timeout: const Duration(seconds: 20));
        final tiket = '${d['tiket'] ?? ''}';
        final sampai = DateTime.tryParse('${d['sampai'] ?? ''}');
        if (tiket.isEmpty || sampai == null) throw ApiException('RESPON_TIDAK_VALID');
        return (tiket: tiket, sampai: sampai.toUtc());
      }, sekarang: sekarang);

  final Future<({String tiket, DateTime sampai})> Function(Sesi s) _ambil;
  final DateTime Function() _sekarang;
  final Duration sisaMin;
  final Map<String, ({String tiket, DateTime sampai})> _simpan = {};
  final Map<String, Future<String>> _jalan = {};

  Future<String> tiket(Sesi s, {bool paksa = false}) {
    final id = s.userId;
    final ada = _simpan[id];
    if (!paksa && ada != null && ada.sampai.difference(_sekarang().toUtc()) > sisaMin) return Future.value(ada.tiket);
    return _jalan[id] ??= _minta(s, paksa).whenComplete(() {
      _jalan.remove(id);   // blok, bukan ekspresi: nilai balik Future yang sama akan membuatnya menunggu dirinya sendiri
    });
  }

  Future<String> _minta(Sesi s, bool paksa) async {
    final id = s.userId;
    final ada = _simpan[id];
    try {
      final baru = await _ambil(s);
      _simpan[id] = baru;
      return baru.tiket;
    } catch (_) {
      // tiket lama yang belum kedaluwarsa tetap sah di server: kerja lapangan tidak berhenti hanya karena gagal memperbarui
      if (!paksa && ada != null && ada.sampai.isAfter(_sekarang().toUtc())) return ada.tiket;
      rethrow;
    }
  }

  /// Lupakan tiket akun [userId] (logout / ganti akun).
  void lupakan(String userId) => _simpan.remove(userId);
}
