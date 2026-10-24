import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../core/api_client.dart';
import '../../core/sesi.dart';

/// v0.75.0 (permintaan kvlar 10 Okt 2026): Approval P0 (menu OPS_VERIFIKASI_P0, ADMIN / SUPER). Alur v1 Verifikasi P0:
/// tanggal > tab Menunggu / Approved / Rejected > kartu dengan foto Sebelum / Pekerjaan / Sesudah > Setujui / Tolak,
/// plus koreksi jenis pekerjaan. Keputusan langsung ke server (point + rekap shift dihitung server saat itu).
class ApprovalP0Repository {
  ApprovalP0Repository(this._api);
  final ApiClient _api;

  static const menu = 'OPS_VERIFIKASI_P0';

  /// Akun boleh membuka Approval P0 (server memeriksa ulang peran).
  static bool boleh(Sesi s) => (s.role == 'ADMIN' || s.role == 'SUPER') && s.aksiMenu(menu) != null;
  static bool bolehUbah(Sesi s) => boleh(s) && s.aksiMenu(menu) == 'UBAH';

  // thumbnail di memori (per sesi aplikasi), foto penuh di folder sementara
  static final Map<String, Uint8List> _kecil = {};

  Future<({Map<String, int> jumlah, List<ItemApprovalP0> list})> daftar(Sesi s, String tanggal, {String? status}) async {
    final d = await _api.call('getApprovalP0', token: s.token, data: {'tanggal': tanggal, if (status != null) 'status': status});
    final j = d['jumlah'] is Map<dynamic, dynamic> ? d['jumlah'] as Map<dynamic, dynamic> : const <dynamic, dynamic>{};
    return (
      jumlah: {for (final k in statusApproval) k: (j[k] as num?)?.toInt() ?? 0},
      list: [
        for (final x in (d['list'] as List? ?? const []).whereType<Map<dynamic, dynamic>>()) ItemApprovalP0(Map<String, dynamic>.from(x)),
      ],
    );
  }

  Map<String, dynamic> _dataFoto(FotoApproval f, String ukuran) =>
      {'p0Id': f.p0Id, 'jenis': f.jenis, if (f.id != null) 'id': f.id, 'slot': f.slot, 'ukuran': ukuran};

  Future<Uint8List> fotoKecil(Sesi s, FotoApproval f) async {
    final ada = _kecil[f.kunci];
    if (ada != null) return ada;
    final d = await _api.call('getFotoApprovalP0', token: s.token, data: _dataFoto(f, 'KECIL'));
    final b = base64Decode('${d['data'] ?? ''}');
    if (_kecil.length > 300) _kecil.remove(_kecil.keys.first);
    _kecil[f.kunci] = b;
    return b;
  }

  /// Foto penuh (watermark terbaca) disimpan di folder sementara. Hasil: path file.
  Future<String> fotoPenuh(Sesi s, FotoApproval f) async {
    final dir = Directory(p.join((await getTemporaryDirectory()).path, 'approval_p0'));
    await dir.create(recursive: true);
    final path = p.join(dir.path, '${f.kunci.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '_')}.jpg');
    final file = File(path);
    if (await file.exists() && await file.length() > 0) return path;
    final d = await _api.call('getFotoApprovalP0', token: s.token, data: _dataFoto(f, 'PENUH'), timeout: const Duration(seconds: 90));
    await file.writeAsBytes(base64Decode('${d['data'] ?? ''}'), flush: true);
    return path;
  }

  Future<ItemApprovalP0> putuskan(Sesi s, ItemApprovalP0 x, String keputusan, {String alasan = '', double? bobot}) async {
    final d = await _api.call('simpanApprovalP0', token: s.token, data: {
      'p0Id': x.p0Id,
      'keputusan': keputusan,
      if (alasan.trim().isNotEmpty) 'alasan': alasan.trim(),
      if (bobot != null) 'bobot': bobot,
      'revision': x.revision,
    });
    return ItemApprovalP0(d);
  }

  Future<ItemApprovalP0> ubahJenis(Sesi s, ItemApprovalP0 x, String nama, {String lainnya = '', required String alasan, double? bobot}) async {
    final d = await _api.call('ubahJenisP0', token: s.token, data: {
      'p0Id': x.p0Id,
      'namaPekerjaan': nama,
      if (lainnya.trim().isNotEmpty) 'pekerjaanLainnya': lainnya.trim(),
      'alasan': alasan.trim(),
      if (bobot != null) 'bobot': bobot,
      'revision': x.revision,
    });
    return ItemApprovalP0(d);
  }
}

const List<String> statusApproval = ['Menunggu', 'Approved', 'Rejected'];
const Map<String, String> labelStatusApproval = {'Menunggu': 'Menunggu', 'Approved': 'Disetujui', 'Rejected': 'Ditolak'};

/// Satu foto yang bisa diminta ke server: P0 (slot Sebelum / Pekerjaan / Sesudah) atau anak (switching / gardu + id).
class FotoApproval {
  const FotoApproval({required this.p0Id, required this.jenis, this.id, required this.slot, required this.label});
  final String p0Id;
  final String jenis; // P0 | SWITCHING | GARDU
  final String? id;
  final String slot;
  final String label;
  String get kunci => '$p0Id-$jenis-${id ?? ''}-$slot';
}

/// Satu P0 di daftar approval (bentuk dari server, getter supaya tampilan tidak bergantung kunci mentah).
class ItemApprovalP0 {
  ItemApprovalP0(this.d);
  final Map<String, dynamic> d;

  String _t(String k) => '${d[k] ?? ''}';
  double? _n(String k) => (d[k] as num?)?.toDouble();

  String get p0Id => _t('p0Id');
  String get kodeP0 => _t('kodeP0');
  String get tanggal => _t('tanggal');
  String get tim => _t('tim');
  String get shift => _t('shift');
  String get petugas => _t('petugas');
  String get namaPekerjaan => _t('namaPekerjaan');
  String get pekerjaanLainnya => _t('pekerjaanLainnya');
  bool get lainLain => d['lainLain'] == true;
  String get namaTampil => lainLain && pekerjaanLainnya.isNotEmpty ? '$namaPekerjaan · $pekerjaanLainnya' : namaPekerjaan;
  String get penyulang => _t('penyulang');
  String get section => _t('section');
  String get daerah => _t('daerah');
  String get catatan => _t('catatan');
  String get status => _t('status');
  bool get sistem => d['sistem'] == true;
  String get alasanRejected => _t('alasanRejected');
  String get approvedOleh => _t('approvedOleh');
  String get waktuApprove => _t('waktuApprove');
  String get waktuSebelum => _t('waktuSebelum');
  String get waktuSesudah => _t('waktuSesudah');
  String get waktuPekerjaan => _t('waktuPekerjaan'); // v1.0.31
  String get waktuDibuat => _t('waktuDibuat'); // v1.0.31
  /// v1.0.31: P0 dari WO Tindak Lanjut (getP0WoYandal).
  String get tlId => _t('tlId');
  double? get durasi => _n('durasi');
  double? get jarakClosing => _n('jarakClosing');
  double? get jarakAntar => _n('jarakAntar');
  String get koordinat => _t('koordinat');
  String get koordinatClosing => _t('koordinatClosing');
  double? get skorDurasi => _n('skorDurasi');
  double? get bobot => _n('bobot');
  double? get pengali => _n('pengali');
  double? get point => _n('point');
  int get revision => (d['revision'] as num?)?.toInt() ?? 0;
  List<String> get foto => [for (final x in (d['foto'] as List? ?? const [])) '$x'];
  List<Map<String, dynamic>> _peta(String k) =>
      [for (final x in (d[k] as List? ?? const []).whereType<Map<dynamic, dynamic>>()) Map<String, dynamic>.from(x)];
  List<Map<String, dynamic>> get koreksiJenis => _peta('koreksiJenis');
  List<Map<String, dynamic>> get switching => _peta('switching');
  List<Map<String, dynamic>> get gardu => _peta('gardu');

  /// Lokasi singkat: penyulang · section · daerah (yang terisi).
  String get lokasi => [penyulang, section, daerah].where((v) => v.trim().isNotEmpty).join(' · ');

  /// Bisa diputuskan / dikoreksi admin (Rejected SISTEM "P0 Tidak Selesai" tidak).
  bool get bisaDiputuskan => !sistem;

  bool cocok(String kata) {
    final k = kata.trim().toLowerCase();
    if (k.isEmpty) return true;
    return '$kodeP0 $namaTampil $lokasi $tim $petugas'.toLowerCase().contains(k);
  }
}
