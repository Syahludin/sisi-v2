import 'env.dart';

/// Sesi login di HP (PRD F-AUTH). Pure Dart, bisa dites tanpa Flutter.
class Sesi {
  Sesi({
    required this.token,
    required this.profil,
    required this.menu,
    required this.offlineSampai,
    this.sesiSampai,
    this.syncSampai,
    this.yandal,
  });

  final String token;
  final Map<String, dynamic> profil;
  final List<Map<String, dynamic>> menu;

  /// 23:59:59 WIB hari berikutnya sejak cekSesi terakhir (dihitung server). Akun YANDAL: akhir shift.
  final DateTime offlineSampai;

  /// v0.63.0: akun YANDAL = token habis di menit peralihan shift (07:59 / 15:59 / 23:59 WIB). Null = akun lain.
  final DateTime? sesiSampai;

  /// v0.63.4: akun YANDAL = batas mode sync (akhir shift + 24 jam). Antara [sesiSampai] dan ini HP tidak boleh input,
  /// hanya mengirim data shift yang tertunda lalu logout. Null = sesi lama / akun lain (langsung keluar di akhir shift).
  final DateTime? syncSampai;

  /// v0.63.0: shift + petugas yang dipilih saat login (akun YANDAL): {shiftId, kodeShift, shift:{no,tanggal,hari,jam}, petugas:[{petugasId,nama}]}.
  final Map<String, dynamic>? yandal;

  /// Akun YANDAL wajib keluar (paksa) saat [sekarang] sudah sampai [sesiSampai]. Jam HP dipakai (juga saat offline).
  bool habisShift(DateTime sekarang) => sesiSampai != null && !sekarang.isBefore(sesiSampai!);

  /// v0.63.4: shift sudah selesai tapi masih boleh mengirim data tertunda (mode sync).
  bool bolehSyncAkhir(DateTime sekarang) => habisShift(sekarang) && syncSampai != null && sekarang.isBefore(syncSampai!);

  /// Nama petugas shift ini (akun YANDAL), urut pilihan.
  List<String> get petugasShift => [
        for (final p in (yandal?['petugas'] as List<dynamic>? ?? const <dynamic>[]).whereType<Map<dynamic, dynamic>>())
          '${p['nama'] ?? ''}',
      ];

  bool get petugasYandal => role == 'PETUGAS' && jenisTim == 'YANDAL';

  /// v0.88.0: petugas Hartek (menu OPS_HARTEK_INPUT): tab utama = input Hartek hari ini.
  bool get petugasHartek => role == 'PETUGAS' && jenisTim == 'HARTEK' && timId.isNotEmpty;

  /// v1.0.0: petugas Inspeksi Jaringan (menu OPS_INSJAR_INPUT).
  bool get petugasInsJar => role == 'PETUGAS' && jenisTim == 'INSPEKSI_JARINGAN' && timId.isNotEmpty;
  /// v1.0.4: tim inspeksi gardu memakai object inspeksi Gardu pada form temuan bersama.
  bool get petugasInsGardu => role == 'PETUGAS' && jenisTim == 'INSPEKSI_GARDU' && timId.isNotEmpty;

  /// v1.0.11: tab Inspeksi Gardu (menu OPS_INSDU_INPUT).
  bool get petugasInsDu => petugasInsGardu && aksiMenu('OPS_INSDU_INPUT') != null;

  /// v1.0.11: tab WO tindak lanjut temuan untuk tim ROW / HARTEK / YANDAL (menu OPS_WO_TIM).
  bool get petugasWo =>
      role == 'PETUGAS' && const ['ROW', 'HARTEK', 'YANDAL'].contains(jenisTim) && timId.isNotEmpty && aksiMenu('OPS_WO_TIM') != null;

  String get userId => profil['userId'] as String;
  String get username => profil['username'] as String;
  String get nama => (profil['nama'] as String?) ?? username;
  String get role => profil['role'] as String;
  String get timKode => (profil['timKode'] as String?) ?? '';
  String get timNama => (profil['timNama'] as String?) ?? '';
  String get jenisTim => (profil['jenisTim'] as String?) ?? '';
  String get ulp => (profil['ulp'] as String?) ?? Env.ulp;
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

  /// cekSesi: profil + menu + batas baru. sesiSampai server tidak pernah memperpanjang lewat yang sudah ada.
  Sesi denganData(Map<String, dynamic> d) {
    final baruSampai = _waktu(d['sesiSampai']);
    return Sesi(
      token: token,
      profil: Map<String, dynamic>.from(d['profil'] as Map<dynamic, dynamic>),
      menu: _menu(d['menu']),
      offlineSampai: DateTime.parse(d['offlineSampai'] as String),
      sesiSampai: sesiSampai == null ? baruSampai : (baruSampai != null && baruSampai.isBefore(sesiSampai!) ? baruSampai : sesiSampai),
      syncSampai: _lebihAwal(syncSampai, _waktu(d['syncSampai'])),
      yandal: yandal,
    );
  }

  static Sesi dariLogin(Map<String, dynamic> d) => Sesi(
        token: d['token'] as String,
        profil: Map<String, dynamic>.from(d['profil'] as Map<dynamic, dynamic>),
        menu: _menu(d['menu']),
        offlineSampai: DateTime.parse(d['offlineSampai'] as String),
        sesiSampai: _waktu(d['sesiSampai']),
        syncSampai: _waktu(d['syncSampai']),
        yandal: _peta(d['yandal']),
      );

  Map<String, dynamic> keJson() => {
        'token': token,
        'profil': profil,
        'menu': menu,
        'offlineSampai': offlineSampai.toUtc().toIso8601String(),
        if (sesiSampai != null) 'sesiSampai': sesiSampai!.toUtc().toIso8601String(),
        if (syncSampai != null) 'syncSampai': syncSampai!.toUtc().toIso8601String(),
        if (yandal != null) 'yandal': yandal,
      };

  static Sesi dariJson(Map<String, dynamic> j) => Sesi(
        token: j['token'] as String,
        profil: Map<String, dynamic>.from(j['profil'] as Map<dynamic, dynamic>),
        menu: _menu(j['menu']),
        offlineSampai: DateTime.parse(j['offlineSampai'] as String),
        sesiSampai: _waktu(j['sesiSampai']),
        syncSampai: _waktu(j['syncSampai']),
        yandal: _peta(j['yandal']),
      );

  /// Batas tidak pernah diperpanjang: ambil yang lebih awal (null = belum ada).
  static DateTime? _lebihAwal(DateTime? a, DateTime? b) => a == null ? b : (b != null && b.isBefore(a) ? b : a);

  static DateTime? _waktu(Object? v) => v is String && v.isNotEmpty ? DateTime.tryParse(v) : null;

  static Map<String, dynamic>? _peta(Object? v) => v is Map<dynamic, dynamic> ? Map<String, dynamic>.from(v) : null;

  static List<Map<String, dynamic>> _menu(Object? v) {
    if (v is! List) return const [];
    return v.whereType<Map<dynamic, dynamic>>().map(Map<String, dynamic>.from).toList();
  }
}
