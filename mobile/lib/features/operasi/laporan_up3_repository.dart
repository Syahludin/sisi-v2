import 'dart:convert';

import '../../core/api_client.dart';
import '../../core/sesi.dart';

/// C4A format UP3 (v0.52): 1 baris per penyulang per hari, Realisasi kmS diisi langsung. Pure Dart.
/// v0.53: Temuan, Tindak Lanjut, Eksekusi (tim yang melakukan tindak lanjut) berupa teks; kosong = "-" di WA.
/// Keterangan hanya disimpan di sheet, tidak ikut ke teks WA.
class C4aUp3Item {
  const C4aUp3Item({
    required this.id,
    required this.penyulang,
    required this.realisasiKms,
    this.temuan = '',
    this.tindakLanjut = '',
    this.eksekusi = '',
    this.keterangan = '',
  });

  final String id;
  final String penyulang;
  final double realisasiKms;
  final String temuan;
  final String tindakLanjut;
  final String eksekusi;
  final String keterangan;

  /// 4.6 -> "4,6", 4 -> "4", 4.355 -> "4,36" (sama dengan angkaKoma_ server).
  static String angkaKoma(double v) {
    final n = (v * 100).round() / 100;
    final t = n == n.truncateToDouble() ? n.toInt().toString() : n.toString();
    return t.replaceAll('.', ',');
  }

  /// "4,6" / "4.6" -> 4.6; tidak valid = null.
  static double? bacaKms(String teks) {
    final t = teks.trim().replaceAll(',', '.');
    if (!RegExp(r'^\d{1,3}(\.\d{1,2})?$').hasMatch(t)) return null;
    return double.parse(t);
  }

  factory C4aUp3Item.dariJson(Map<String, dynamic> j) => C4aUp3Item(
        id: j['id'] as String,
        penyulang: (j['penyulang'] as String?) ?? '',
        realisasiKms: (j['realisasiKms'] as num?)?.toDouble() ?? 0,
        temuan: _teks(j['temuan']),
        tindakLanjut: _teks(j['tindakLanjut']),
        eksekusi: _teks(j['eksekusi']),
        keterangan: _teks(j['keterangan']),
      );

  static String _teks(Object? v) => v == null ? '' : '$v';

  Map<String, dynamic> keServer() => {
        'id': id,
        'penyulang': penyulang,
        'realisasiKms': realisasiKms,
        if (temuan.isNotEmpty) 'temuan': temuan,
        if (tindakLanjut.isNotEmpty) 'tindakLanjut': tindakLanjut,
        if (eksekusi.isNotEmpty) 'eksekusi': eksekusi,
        if (keterangan.isNotEmpty) 'keterangan': keterangan,
      };
}

/// C4A format UIW / Care for Asset (v0.51): 1 baris per section per hari. Pure Dart.
/// Panjang kmS dihitung server (tiang x 0,05); di HP hanya untuk tampilan.
class C4aItem {
  const C4aItem({
    required this.id,
    required this.sectionId,
    required this.penyulang,
    required this.section,
    required this.jumlahTiang,
    this.temuanPeralatan = 0,
    this.temuanRow = 0,
    this.eksekusi = 0,
    this.keterangan = '',
  });

  final String id;
  final String sectionId;
  final String penyulang;
  final String section;
  final int jumlahTiang;
  final int temuanPeralatan;
  final int temuanRow;
  final int eksekusi;
  final String keterangan;

  static const double kmsPerTiang = 0.05;

  /// "4,35" (gaya Indonesia, 2 desimal), sama dengan teks WA server.
  static String kmsTeks(int tiang) => (tiang * kmsPerTiang).toStringAsFixed(2).replaceAll('.', ',');

  int get temuan => temuanPeralatan + temuanRow;

  static int _angka(Object? v) => v is num ? v.toInt() : 0;

  factory C4aItem.dariJson(Map<String, dynamic> j) => C4aItem(
        id: j['id'] as String,
        sectionId: j['sectionId'] as String,
        penyulang: (j['penyulang'] as String?) ?? '',
        section: (j['section'] as String?) ?? '',
        jumlahTiang: _angka(j['jumlahTiang']),
        temuanPeralatan: _angka(j['temuanPeralatan']),
        temuanRow: _angka(j['temuanRow']),
        eksekusi: _angka(j['eksekusi']),
        keterangan: (j['keterangan'] as String?) ?? '',
      );

  /// Hanya field yang diterima server (nama penyulang/section diambil server dari master).
  Map<String, dynamic> keServer() => {
        'id': id,
        'sectionId': sectionId,
        'jumlahTiang': jumlahTiang,
        'temuanPeralatan': temuanPeralatan,
        'temuanRow': temuanRow,
        'eksekusi': eksekusi,
        if (keterangan.isNotEmpty) 'keterangan': keterangan,
      };
}

/// Laporan UP3 / UIW. Teks WA selalu dibuat server. HP hanya input C4A (+ Cuaca untuk UIW).
/// v0.57: menu dipecah (OPS_LAP_UP3 / OPS_LAP_UIW), endpoint dan akses per laporan.
/// Input hanya ADMIN / SUPER untuk hari ini; server yang menegakkan.
class LaporanUp3Repository {
  LaporanUp3Repository(this._api);

  final ApiClient _api;

  static const menu = {'UP3': 'OPS_LAP_UP3', 'UIW': 'OPS_LAP_UIW'};

  /// bagian = 'UP3' | 'UIW'. Respons: {bagian, tanggal, sumber, hariIni, bisaUbah, laporan, revision, c4a,
  /// statusTim, row, waText, cuaca (UIW saja)}.
  Future<Map<String, dynamic>> muat(Sesi s, String bagian, String tanggal) =>
      _api.call(bagian == 'UP3' ? 'getLaporanUp3' : 'getLaporanUiw', token: s.token, data: {'tanggal': tanggal});

  /// Payload simpanLaporanUp3 (v0.62.9: dipisah supaya kirim ulang memakai payload yang SAMA persis).
  static Map<String, dynamic> dataUp3({required String tanggal, required int revision, required List<C4aUp3Item> c4a}) => {
        'tanggal': tanggal,
        'revision': revision,
        'c4a': [for (final c in c4a) c.keServer()],
      };

  static Map<String, dynamic> dataUiw({required String tanggal, required int revision, required String cuaca, required List<C4aItem> c4a}) => {
        'tanggal': tanggal,
        'revision': revision,
        if (cuaca.isNotEmpty) 'cuaca': cuaca,
        'c4a': [for (final c in c4a) c.keServer()],
      };

  static String _endpoint(String bagian) => bagian == 'UP3' ? 'simpanLaporanUp3' : 'simpanLaporanUiw';

  /// revision = revision laporan itu yang dilihat (0 = belum ada baris). Daftar = daftar LENGKAP hari ini.
  Future<Map<String, dynamic>> simpanUp3(Sesi s, {required String tanggal, required int revision, required List<C4aUp3Item> c4a}) =>
      _api.call('simpanLaporanUp3', token: s.token, data: dataUp3(tanggal: tanggal, revision: revision, c4a: c4a));

  Future<Map<String, dynamic>> simpanUiw(
    Sesi s, {
    required String tanggal,
    required int revision,
    required String cuaca,
    required List<C4aItem> c4a,
  }) =>
      _api.call('simpanLaporanUiw', token: s.token, data: dataUiw(tanggal: tanggal, revision: revision, cuaca: cuaca, c4a: c4a));

  /// Gagal jaringan / timeout / server sibuk / kesalahan server = kirim ulang aman (v0.62.9).
  static bool bolehUlang(Object e) {
    if (e is! ApiException) return true; // TimeoutException, SocketException, ClientException
    return e.kode.startsWith('HTTP_') || e.kode == 'SERVER_SIBUK' || e.kode == 'KESALAHAN_SERVER';
  }

  /// Bentuk pembanding satu C4A (kunci urut, teks dirapikan) supaya isi server bisa dibandingkan dengan yang dikirim.
  static String _sidik(String bagian, Map<String, dynamic> c) {
    final m = Map<String, dynamic>.of(c);
    if (bagian == 'UP3') {
      m['penyulang'] = '${m['penyulang'] ?? ''}'.trim().toLowerCase();
      m['realisasiKms'] = ((m['realisasiKms'] as num? ?? 0) * 100).round();
    }
    final kunci = m.keys.toList()..sort();
    return jsonEncode({for (final k in kunci) k: m[k]});
  }

  /// Isi laporan di server (respons muat) sama dengan payload yang dikirim? Dipakai setelah KONFLIK_REVISION.
  static bool isiSama(String bagian, Map<String, dynamic> kirim, Map<String, dynamic> server) {
    if (bagian == 'UIW' && '${kirim['cuaca'] ?? ''}' != '${server['cuaca'] ?? ''}') return false;
    final daftar = (server['c4a'] as List<dynamic>? ?? const <dynamic>[]).whereType<Map<String, dynamic>>();
    final dariServer = [
      for (final c in daftar) _sidik(bagian, bagian == 'UP3' ? C4aUp3Item.dariJson(c).keServer() : C4aItem.dariJson(c).keServer()),
    ]..sort();
    final dikirim = [for (final c in (kirim['c4a'] as List<dynamic>).cast<Map<String, dynamic>>()) _sidik(bagian, c)]..sort();
    return jsonEncode(dariServer) == jsonEncode(dikirim);
  }

  /// v0.62.9: simpan dengan pemulihan. Server menulis C4A dulu lalu baris harian + revision terakhir, jadi:
  /// - gagal jaringan / server = kirim ulang payload + revision yang SAMA (maks [ulang] kali, jeda bertambah);
  /// - KONFLIK_REVISION setelah percobaan yang gagal = mungkin simpan sebelumnya sebenarnya masuk (respons hilang):
  ///   muat ulang; isi server sama dengan yang dikirim = berhasil (kalau masih tertunda, dikunci sekali lagi
  ///   dengan revision server). Isi beda = KONFLIK_REVISION diteruskan (admin lain mengubah).
  Future<Map<String, dynamic>> simpanPulih(
    Sesi s,
    String bagian,
    Map<String, dynamic> data, {
    int ulang = 2,
    Future<void> Function(Duration) tunda = _tundaAsli,
  }) async {
    var gagalSebelumnya = false;
    var i = 0;
    while (true) {
      try {
        return await _api.call(_endpoint(bagian), token: s.token, data: data);
      } catch (e) {
        if (e is ApiException && e.kode == 'KONFLIK_REVISION' && gagalSebelumnya) {
          final server = await muat(s, bagian, '${data['tanggal']}');
          if (!isiSama(bagian, data, server)) rethrow;
          if (server['tertunda'] != true) return server;
          final kunci = Map<String, dynamic>.of(data)..['revision'] = (server['revision'] as num?)?.toInt() ?? 0;
          return await _api.call(_endpoint(bagian), token: s.token, data: kunci);
        }
        if (!bolehUlang(e) || i >= ulang) rethrow;
        gagalSebelumnya = true;
        i++;
        await tunda(Duration(seconds: 2 * i));
      }
    }
  }

  static Future<void> _tundaAsli(Duration d) => Future<void>.delayed(d);
}
