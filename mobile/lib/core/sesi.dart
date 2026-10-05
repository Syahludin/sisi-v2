/// Sesi login di HP (PRD F-AUTH). Pure Dart, bisa dites tanpa Flutter.
class Sesi {
  Sesi({
    required this.token,
    required this.profil,
    required this.menu,
    required this.offlineSampai,
  });

  final String token;
  final Map<String, dynamic> profil;
  final List<Map<String, dynamic>> menu;

  /// 23:59:59 WIB hari berikutnya sejak cekSesi terakhir (dihitung server).
  final DateTime offlineSampai;

  String get userId => profil['userId'] as String;
  String get username => profil['username'] as String;
  String get nama => (profil['nama'] as String?) ?? username;
  String get role => profil['role'] as String;
  String get timKode => (profil['timKode'] as String?) ?? '';
  String get timNama => (profil['timNama'] as String?) ?? '';
  String get jenisTim => (profil['jenisTim'] as String?) ?? '';
  String get ulp => (profil['ulp'] as String?) ?? 'Toboali';
  String get timId => (profil['timId'] as String?) ?? '';

  /// v0.50: ADMIN / SUPER / ADMIN_ES memakai tab Operasi (lihat laporan semua tim), bukan input ROW.
  bool get modeAdmin => role != 'PETUGAS';

  /// Petugas lapangan ROW: punya outbox, tarik kode, dan input data.
  bool get petugasRow => role == 'PETUGAS' && jenisTim == 'ROW' && timId.isNotEmpty;

  /// Input baru hanya boleh sebelum batas offline (PRD Alur E).
  bool bolehInput(DateTime sekarang) => sekarang.isBefore(offlineSampai);

  /// Aksi menu: 'UBAH', 'LIHAT', atau null (tidak punya menu).
  String? aksiMenu(String kode) {
    for (final m in menu) {
      if (m['kode'] == kode) return m['aksi'] as String?;
    }
    return null;
  }

  bool bisaUbah(String kodeMenu) => aksiMenu(kodeMenu) == 'UBAH';

  Sesi denganData(Map<String, dynamic> d) => Sesi(
        token: token,
        profil: Map<String, dynamic>.from(d['profil'] as Map<dynamic, dynamic>),
        menu: _menu(d['menu']),
        offlineSampai: DateTime.parse(d['offlineSampai'] as String),
      );

  static Sesi dariLogin(Map<String, dynamic> d) => Sesi(
        token: d['token'] as String,
        profil: Map<String, dynamic>.from(d['profil'] as Map<dynamic, dynamic>),
        menu: _menu(d['menu']),
        offlineSampai: DateTime.parse(d['offlineSampai'] as String),
      );

  Map<String, dynamic> keJson() => {
        'token': token,
        'profil': profil,
        'menu': menu,
        'offlineSampai': offlineSampai.toUtc().toIso8601String(),
      };

  static Sesi dariJson(Map<String, dynamic> j) => Sesi(
        token: j['token'] as String,
        profil: Map<String, dynamic>.from(j['profil'] as Map<dynamic, dynamic>),
        menu: _menu(j['menu']),
        offlineSampai: DateTime.parse(j['offlineSampai'] as String),
      );

  static List<Map<String, dynamic>> _menu(Object? v) {
    if (v is! List) return const [];
    return v.whereType<Map<dynamic, dynamic>>().map(Map<String, dynamic>.from).toList();
  }
}
