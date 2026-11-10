import '../../core/api_client.dart';
import '../../core/sesi.dart';

/// v0.99.0 (permintaan Master Guswan 18 Okt 2026): Operasi > Laporan per Tim untuk tim YANDAL (admin).
/// Satu tanggal operasional: tiap tim 3 shift, status login, crew, check-in, HP yang masih login, rekap + daftar P0.
/// Hanya baca (endpoint getLaporanTimYandal, menu ROW_LAPORAN, bukan PETUGAS).
class LaporanYandalRepository {
  LaporanYandalRepository(this._api);
  final ApiClient _api;

  Future<LaporanYandal> muat(Sesi s, {String? tanggal, String? timId}) async {
    final d = await _api.call('getLaporanTimYandal', token: s.token, data: {
      if (tanggal != null) 'tanggal': tanggal,
      if (timId != null) 'timId': timId,
    });
    return LaporanYandal.dariJson(d);
  }
}

/// Status login satu shift (sama dengan statusLoginShift_ di server).
class StatusLoginYandal {
  StatusLoginYandal._();
  static const belumMulai = 'BELUM_MULAI';
  static const belumLogin = 'BELUM_LOGIN';
  static const login = 'LOGIN';
  static const selesai = 'SELESAI';
  static const tidakLogin = 'TIDAK_LOGIN';

  static String label(String s) => switch (s) {
        login => 'Sudah login',
        belumLogin => 'Belum login',
        selesai => 'Selesai',
        tidakLogin => 'Tidak login',
        _ => 'Belum mulai',
      };

  /// Tim sudah masuk shift (sedang berjalan atau sudah selesai).
  static bool masuk(String s) => s == login || s == selesai;
}

int _int(Object? v) => v is num ? v.toInt() : int.tryParse('${v ?? ''}') ?? 0;
double _dbl(Object? v) => v is num ? v.toDouble() : double.tryParse('${v ?? ''}') ?? 0;
String _str(Object? v) => v == null ? '' : '$v';
List<Map<String, dynamic>> _maps(Object? v) => [
      for (final x in (v is List ? v : const <dynamic>[]).whereType<Map<dynamic, dynamic>>()) Map<String, dynamic>.from(x),
    ];

class LoginYandal {
  const LoginYandal({required this.waktuMasuk, this.perangkat = '', this.platform = '', this.petugas = '',
      this.waktuLogout = '', this.alasanLogout = '', this.aktif = false});
  final String waktuMasuk;
  final String perangkat;
  final String platform;
  final String petugas;
  final String waktuLogout;
  final String alasanLogout;
  final bool aktif;

  factory LoginYandal.dariJson(Map<String, dynamic> j) => LoginYandal(
        waktuMasuk: _str(j['waktuMasuk']), perangkat: _str(j['perangkat']), platform: _str(j['platform']),
        petugas: _str(j['petugas']), waktuLogout: _str(j['waktuLogout']), alasanLogout: _str(j['alasanLogout']),
        aktif: j['aktif'] == true,
      );
}

class RekapP0Yandal {
  const RekapP0Yandal({this.jumlahP0 = 0, this.proses = 0, this.selesai = 0, this.menunggu = 0, this.approved = 0,
      this.rejected = 0, this.totalPoint = 0, this.totalDurasi = 0, this.jamEfektif = 0, this.persenEfektif = 0, this.totalJarak = 0});
  final int jumlahP0, proses, selesai, menunggu, approved, rejected;
  final double totalPoint, totalDurasi, jamEfektif, persenEfektif, totalJarak;

  factory RekapP0Yandal.dariJson(Map<String, dynamic> j) => RekapP0Yandal(
        jumlahP0: _int(j['jumlahP0']), proses: _int(j['proses']), selesai: _int(j['selesai']), menunggu: _int(j['menunggu']),
        approved: _int(j['approved']), rejected: _int(j['rejected']), totalPoint: _dbl(j['totalPoint']),
        totalDurasi: _dbl(j['totalDurasi']), jamEfektif: _dbl(j['jamEfektif']), persenEfektif: _dbl(j['persenEfektif']),
        totalJarak: _dbl(j['totalJarak']),
      );
}

/// Satu P0 di laporan (bentuk ringkasP0Arsip_ server).
class P0LaporanYandal {
  const P0LaporanYandal(this.j);
  final Map<String, dynamic> j;
  String get kodeP0 => _str(j['kodeP0']);
  String get namaPekerjaan => _str(j['namaPekerjaan']);
  String get penyulang => _str(j['penyulang']);
  String get section => _str(j['section']);
  String get daerah => _str(j['daerah']);
  String get statusP0 => _str(j['statusP0']).toUpperCase();
  String get statusApproval => _str(j['statusApproval']);
  String get alasanRejected => _str(j['alasanRejected']);
  double get point => _dbl(j['point']);
  double get durasi => _dbl(j['durasi']);
  int get jarakM => _int(j['jarakM']);
  String get waktuSebelum => _str(j['waktuSebelum']);
  String get waktuSesudah => _str(j['waktuSesudah']);
  String get catatan => _str(j['catatan']);

  /// PROSES | MENUNGGU | APPROVED | REJECTED (untuk badge).
  String get tahap {
    final a = statusApproval.toLowerCase();
    if (a == 'approved') return 'APPROVED';
    if (a == 'rejected') return 'REJECTED';
    return statusP0 == 'SELESAI' ? 'MENUNGGU' : 'PROSES';
  }
}

class ShiftLaporanYandal {
  const ShiftLaporanYandal({required this.no, required this.jam, required this.status, this.menitBelumLogin = 0,
      this.shiftId = '', this.kodeShift = '', this.petugas = const [], this.checkIn = '', this.terlambat = 0,
      this.jumlahLogin = 0, this.hpAktif = 0, this.login = const [], this.rekapFinal = '', this.rekap = const RekapP0Yandal(),
      this.p0 = const []});
  final int no;
  final String jam;
  final String status;
  final int menitBelumLogin;
  final String shiftId;
  final String kodeShift;
  final List<String> petugas;
  final String checkIn;
  final int terlambat;
  final int jumlahLogin;
  final int hpAktif;
  final List<LoginYandal> login;
  final String rekapFinal;
  final RekapP0Yandal rekap;
  final List<P0LaporanYandal> p0;

  bool get masuk => StatusLoginYandal.masuk(status);

  factory ShiftLaporanYandal.dariJson(Map<String, dynamic> j) => ShiftLaporanYandal(
        no: _int(j['no']), jam: _str(j['jam']), status: _str(j['status']), menitBelumLogin: _int(j['menitBelumLogin']),
        shiftId: _str(j['shiftId']), kodeShift: _str(j['kodeShift']),
        petugas: [for (final p in (j['petugas'] is List ? j['petugas'] as List : const <dynamic>[])) '$p'],
        checkIn: _str(j['checkIn']), terlambat: _int(j['terlambat']), jumlahLogin: _int(j['jumlahLogin']), hpAktif: _int(j['hpAktif']),
        login: [for (final l in _maps(j['login'])) LoginYandal.dariJson(l)], rekapFinal: _str(j['rekapFinal']),
        rekap: RekapP0Yandal.dariJson(j['rekap'] is Map ? Map<String, dynamic>.from(j['rekap'] as Map) : const {}),
        p0: [for (final p in _maps(j['p0'])) P0LaporanYandal(p)],
      );
}

class TimLaporanYandal {
  const TimLaporanYandal({required this.timId, required this.nama, this.kode = '', this.petugasAktif = 0, this.shift = const []});
  final String timId;
  final String nama;
  final String kode;
  final int petugasAktif;
  final List<ShiftLaporanYandal> shift;

  ShiftLaporanYandal? shiftKe(int no) {
    for (final s in shift) {
      if (s.no == no) return s;
    }
    return null;
  }

  int get totalP0 => shift.fold<int>(0, (a, s) => a + s.rekap.jumlahP0);
  int get totalMenunggu => shift.fold<int>(0, (a, s) => a + s.rekap.menunggu);

  factory TimLaporanYandal.dariJson(Map<String, dynamic> j) => TimLaporanYandal(
        timId: _str(j['timId']), nama: _str(j['nama']), kode: _str(j['kode']), petugasAktif: _int(j['petugasAktif']),
        shift: [for (final s in _maps(j['shift'])) ShiftLaporanYandal.dariJson(s)],
      );
}

class LaporanYandal {
  const LaporanYandal({required this.tanggal, this.hari = '', this.shiftSekarang = 0, this.tanggalSekarang = '', this.jamSekarang = '',
      this.ringkas, this.tim = const []});
  final String tanggal;
  final String hari;

  /// Shift yang sedang berjalan menurut jam server + tanggal operasionalnya.
  final int shiftSekarang;
  final String tanggalSekarang;
  final String jamSekarang;

  /// Ringkasan login shift berjalan (hanya kalau [tanggal] = tanggal operasional sekarang).
  final ({int shift, String jam, int jumlahTim, int sudahLogin, int belumLogin})? ringkas;
  final List<TimLaporanYandal> tim;

  bool get hariIni => tanggal.isNotEmpty && tanggal == tanggalSekarang;

  TimLaporanYandal? timDengan(String timId) {
    for (final t in tim) {
      if (t.timId == timId) return t;
    }
    return null;
  }

  factory LaporanYandal.dariJson(Map<String, dynamic> j) {
    final s = j['sekarang'] is Map ? Map<String, dynamic>.from(j['sekarang'] as Map) : const <String, dynamic>{};
    final r = j['ringkas'] is Map ? Map<String, dynamic>.from(j['ringkas'] as Map) : null;
    return LaporanYandal(
      tanggal: _str(j['tanggal']), hari: _str(j['hari']),
      shiftSekarang: _int(s['no']), tanggalSekarang: _str(s['tanggal']), jamSekarang: _str(s['jam']),
      ringkas: r == null
          ? null
          : (shift: _int(r['shift']), jam: _str(r['jam']), jumlahTim: _int(r['jumlahTim']), sudahLogin: _int(r['sudahLogin']),
              belumLogin: _int(r['belumLogin'])),
      tim: [for (final t in _maps(j['tim'])) TimLaporanYandal.dariJson(t)],
    );
  }
}
