import 'dart:math';

/// C4A (permintaan Master Guswan 15 Nov 2026): Laporan C4A di HP. Satu laporan = 1 penyulang + 1 section,
/// titik awal -> temuan -> titik akhir; jarak jalan dihitung server. c4aId / uniqueid = 8 hex dibuat di HP
/// (kunci offline + penghubung ke file UIW).

final _acak = Random.secure();

/// 8 karakter hex huruf kecil (seperti UNIQUEID AppSheet).
String buatUniqueIdC4a([Random? r]) {
  final g = r ?? _acak;
  return List.generate(8, (_) => g.nextInt(16).toRadixString(16)).join();
}

class LaporanC4A {
  LaporanC4A({
    required this.c4aId,
    required this.tanggal,
    required this.penyulang,
    required this.section,
    required this.latAwal,
    required this.lngAwal,
    required this.sumberAwal,
    this.kodeC4a = '',
    this.status = 'TERBUKA',
    this.latAkhir,
    this.lngAkhir,
    this.jarakKm,
    this.jumlahTemuan = 0,
  });

  final String c4aId, tanggal, penyulang, section, sumberAwal, kodeC4a, status;
  final double latAwal, lngAwal;
  final double? latAkhir, lngAkhir, jarakKm;
  final int jumlahTemuan;

  /// Laporan yang masih bisa ditambah temuan: TERBUKA dan dibuat hari ini (laporan hari lalu ditutup otomatis server).
  bool terbukaHariIni(String hariIni) => status == 'TERBUKA' && tanggal == hariIni;

  static double? _d(Object? v) => v == null || v == '' ? null : (v is num ? v.toDouble() : double.tryParse('$v'));

  factory LaporanC4A.fromJson(Map<String, dynamic> j) => LaporanC4A(
        c4aId: '${j['c4aId'] ?? ''}',
        kodeC4a: '${j['kodeC4a'] ?? ''}',
        tanggal: '${j['tanggal'] ?? ''}',
        penyulang: '${j['penyulang'] ?? ''}',
        section: '${j['section'] ?? ''}',
        latAwal: _d(j['latAwal']) ?? 0,
        lngAwal: _d(j['lngAwal']) ?? 0,
        sumberAwal: '${j['sumberAwal'] ?? ''}',
        status: '${j['status'] ?? 'TERBUKA'}',
        latAkhir: _d(j['latAkhir']),
        lngAkhir: _d(j['lngAkhir']),
        jarakKm: _d(j['jarakKm']),
        jumlahTemuan: _d(j['jumlahTemuan'])?.toInt() ?? 0,
      );

  Map<String, dynamic> toJson() => {
        'c4aId': c4aId,
        'kodeC4a': kodeC4a,
        'tanggal': tanggal,
        'penyulang': penyulang,
        'section': section,
        'latAwal': latAwal,
        'lngAwal': lngAwal,
        'sumberAwal': sumberAwal,
        'status': status,
        'latAkhir': latAkhir,
        'lngAkhir': lngAkhir,
        'jarakKm': jarakKm,
        'jumlahTemuan': jumlahTemuan,
      };

  /// Salinan HP sesudah titik akhir diambil (riwayat tab Laporan C4A sebelum jawaban server).
  LaporanC4A selesai(double lat, double lng) =>
      LaporanC4A.fromJson({...toJson(), 'status': 'SELESAI', 'latAkhir': lat, 'lngAkhir': lng});

  /// Isian buatLaporanC4A.
  Map<String, dynamic> isiBuat() => {
        'c4aId': c4aId,
        'penyulang': penyulang,
        'section': section,
        'koordinatAwal': '$latAwal, $lngAwal',
        'sumberAwal': sumberAwal,
      };
}
