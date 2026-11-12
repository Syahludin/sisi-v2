/// Versi app yang tampil di Pengaturan (sejak v0.62.4). WAJIB sama dengan `version:` di pubspec.yaml (tanpa +build)
/// DAN dengan VERSI_BACKEND_ di backend/src/09_Versi.js (v0.81.0); test backend gagal kalau lupa diubah.
const String versiApp = '1.0.78';

/// "0.81.0" -> [0, 81, 0]. Tidak valid = null.
List<int>? pecahVersi(String v) {
  final m = RegExp(r'^(\d{1,3})\.(\d{1,3})\.(\d{1,3})$').firstMatch(v.trim());
  return m == null ? null : [int.parse(m.group(1)!), int.parse(m.group(2)!), int.parse(m.group(3)!)];
}

/// -1 / 0 / 1 (a lebih lama / sama / lebih baru dari b). Tidak valid = null.
int? bandingVersi(String a, String b) {
  final x = pecahVersi(a), y = pecahVersi(b);
  if (x == null || y == null) return null;
  for (var i = 0; i < 3; i++) {
    if (x[i] != y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return 0;
}

/// v0.81.0: hasil perbandingan versi app dengan backend.
enum StatusVersi { sama, updateTersedia, wajibUpdate, serverLama, tidakDiketahui }

/// Info versi dari ping (backend infoVersi_).
class InfoVersi {
  const InfoVersi({required this.server, required this.minimum, this.linkUnduh = '', this.catatan = '', this.notifikasi = true, this.tiangApi = ''});
  final String server;
  final String minimum;
  final String linkUnduh;
  final String catatan;

  /// false (Script Property NOTIFIKASI_UPDATE_APP = TIDAK): update opsional dan info server lama disenyapkan; wajib update tetap tampil.
  final bool notifikasi;

  /// Alamat API tiang di Hostinger (Script Property TIANG_API_URL, https). Kosong = HP memakai jalur Apps Script lama.
  final String tiangApi;

  static InfoVersi? dariJson(Object? j) {
    if (j is! Map) return null;
    final server = '${j['server'] ?? ''}';
    if (pecahVersi(server) == null) return null;
    final min = '${j['minimum'] ?? ''}';
    return InfoVersi(
      server: server,
      minimum: pecahVersi(min) == null ? server : min,
      linkUnduh: '${j['linkUnduh'] ?? ''}'.startsWith('https://') ? '${j['linkUnduh']}' : '',
      catatan: '${j['catatan'] ?? ''}',
      notifikasi: j['notifikasi'] != false,
      tiangApi: '${j['tiangApi'] ?? ''}'.startsWith('https://') ? '${j['tiangApi']}'.replaceAll(RegExp(r'/+$'), '') : '',
    );
  }

  /// app < minimum = wajib; app < server = tersedia; app > server = server belum diperbarui.
  /// [abaikanSenyap] = cek manual (Pengaturan): tampilkan status sebenarnya walau notifikasi dimatikan.
  StatusVersi statusUntuk(String app, {bool abaikanSenyap = false}) {
    final keServer = bandingVersi(app, server), keMin = bandingVersi(app, minimum);
    if (keServer == null || keMin == null) return StatusVersi.tidakDiketahui;
    if (keMin < 0) return StatusVersi.wajibUpdate;
    if (!notifikasi && !abaikanSenyap) return StatusVersi.sama;
    if (keServer < 0) return StatusVersi.updateTersedia;
    if (keServer > 0) return StatusVersi.serverLama;
    return StatusVersi.sama;
  }
}
