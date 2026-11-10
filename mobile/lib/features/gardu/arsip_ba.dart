import 'dart:convert';
import 'dart:typed_data';

import '../../core/api_client.dart';
import '../../core/sesi.dart';

/// v0.86.0 (keputusan Master Guswan 13 Okt 2026): Arsip BA v1, BACA SAJA, untuk tracking BA lama (Rekap Gardu + Rekap Switching v1).
/// Data dari sheet arsip_BA_V1 (ADMIN_migrasiArsipBa), tampil satu halaman dengan BA v2 di Lihat BA & PDF.
/// Tidak ada edit, buat ulang PDF, kirim EAM.

String _t(Object? v) => v == null ? '' : '$v';

/// Satu BA lama.
class ItemArsipBa {
  const ItemArsipBa({
    required this.arsipId,
    required this.peralatan,
    required this.idBa,
    required this.noBaFull,
    required this.jenis,
    required this.nama,
    required this.tanggalBa,
    required this.tahap,
    this.sumber = '',
    this.garduId = '',
    this.penyulang = '',
    this.section = '',
    this.alamat = '',
    this.kva,
    this.jenisSwitching = '',
    this.adaPdf = false,
    this.adaTtd = false,
    this.urlPdf = '',
    this.urlTtd = '',
    this.statusPdf = '',
    this.waktuPdf = '',
  });
  final String arsipId;
  final String sumber;
  final String peralatan; // TRAFO | SWITCHING
  final String idBa;
  final String noBaFull;
  final String jenis;
  final String nama; // No Gardu (TRAFO) / Nama Switching
  final String garduId;
  final String tanggalBa;
  final String penyulang;
  final String section;
  final String alamat;
  final num? kva;
  final String jenisSwitching;
  final String tahap; // DRAFT | PROSES_TTD | SELESAI_TTD
  final bool adaPdf;
  final bool adaTtd;
  final String urlPdf;
  final String urlTtd;
  final String statusPdf;
  final String waktuPdf;

  bool get switching => peralatan == 'SWITCHING';

  /// Nomor yang ditampilkan: No BA Full, kalau kosong ID BA.
  String get nomor => noBaFull.isNotEmpty ? noBaFull : (idBa.isNotEmpty ? idBa : 'Tanpa nomor BA');

  /// Link Drive asli (untuk Salin Link), kosong = tidak ada.
  String get linkPdf => urlPdf.startsWith('https://') ? urlPdf : '';
  String get linkTtd => urlTtd.startsWith('https://') ? urlTtd : '';

  factory ItemArsipBa.dariJson(Map<String, dynamic> j) => ItemArsipBa(
        arsipId: _t(j['arsipId']),
        sumber: _t(j['sumber']),
        peralatan: _t(j['peralatan']).isEmpty ? 'TRAFO' : _t(j['peralatan']),
        idBa: _t(j['idBa']),
        noBaFull: _t(j['noBaFull']),
        jenis: _t(j['jenis']),
        nama: _t(j['nama']),
        garduId: _t(j['garduId']),
        tanggalBa: _t(j['tanggalBa']),
        penyulang: _t(j['penyulang']),
        section: _t(j['section']),
        alamat: _t(j['alamat']),
        kva: j['kva'] is num ? j['kva'] as num : null,
        jenisSwitching: _t(j['jenisSwitching']),
        tahap: _t(j['tahap']).isEmpty ? 'DRAFT' : _t(j['tahap']),
        adaPdf: j['adaPdf'] == true,
        adaTtd: j['adaTtd'] == true,
        urlPdf: _t(j['urlPdf']),
        urlTtd: _t(j['urlTtd']),
        statusPdf: _t(j['statusPdfV1'] ?? j['statusPdf']),
        waktuPdf: _t(j['waktuPdf']),
      );
}

/// File arsip lewat server (wajib online, khusus admin BA). Daftarnya ikut getDaftarBaGardu (satu halaman dengan BA v2).
class ArsipBaRepository {
  ArsipBaRepository(this._api);
  final ApiClient _api;

  /// PDF / BA TTD lama lewat server (HP tidak membuka Drive).
  Future<({String namaFile, String mime, Uint8List bytes, String url})> file(Sesi s, String arsipId, {required bool ttd}) async {
    final r = await _api.call('getFileArsipBaGardu',
        token: s.token, timeout: const Duration(seconds: 120), data: {'arsipId': arsipId, 'berkas': ttd ? 'TTD' : 'PDF'});
    return (namaFile: _t(r['namaFile']), mime: _t(r['mime']), bytes: base64Decode(_t(r['data'])), url: _t(r['url']));
  }
}
