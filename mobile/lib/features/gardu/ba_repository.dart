import 'dart:convert';
import 'dart:math' as math;

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:image/image.dart' as img;
import 'package:uuid/uuid.dart';

import '../../core/api_client.dart';
import '../../core/sesi.dart';
import 'arsip_ba.dart';

/// Batas foto server (FOTO_MAKS_BYTE_ / FOTO_MAKS_SISI_).
const int fotoBaMaksByte = 2 * 1024 * 1024;
const int fotoBaMaksSisi = 2048;

/// Foto galeri / kamera -> JPEG <= 2048 px dan <= 2 MB (server hanya menerima JPEG). Jalan di isolate.
Uint8List siapkanJpegBa(Uint8List b) {
  final jpeg = b.length > 3 && b[0] == 0xFF && b[1] == 0xD8;
  if (jpeg && b.length <= fotoBaMaksByte) {
    final d = img.JpegDecoder().startDecode(b);
    final sisi = d == null ? 0 : math.max(d.width, d.height);
    if (sisi > 0 && sisi <= fotoBaMaksSisi) return b;
  }
  final g = img.decodeImage(b);
  if (g == null) throw StateError('Foto tidak terbaca');
  var kecil = g;
  if (math.max(g.width, g.height) > fotoBaMaksSisi) {
    kecil = g.width >= g.height ? img.copyResize(g, width: fotoBaMaksSisi) : img.copyResize(g, height: fotoBaMaksSisi);
  }
  for (final q in const [85, 72, 60, 48]) {
    final hasil = Uint8List.fromList(img.encodeJpg(kecil, quality: q));
    if (hasil.length <= fotoBaMaksByte) return hasil;
  }
  throw StateError('Foto terlalu besar');
}

/// sha256 hex foto (sama dengan yang dicek server).
String shaHexBa(Uint8List b) => sha256.convert(b).toString();

/// v0.70.0: panggilan server Berita Acara Gardu (wajib online, khusus admin).
class BaRepository {
  BaRepository(this._api);
  final ApiClient _api;

  /// Pratinjau nomor gardu baru + nomor BATAL yang bisa dipakai ulang.
  Future<Map<String, dynamic>> nomorBaru(Sesi s, String prefix) =>
      _api.call('getNomorGarduBaru', token: s.token, data: {'prefix': prefix});

  /// v0.73.0: pesan nomor gardu untuk BA ini (server). Panggil ulang dengan isian sama = nomor sama, diperpanjang.
  Future<Map<String, dynamic>> pesanNomor(Sesi s, {required String baId, required String prefix, String? nomorBatalId}) =>
      _api.call('pesanNomorGardu', token: s.token, data: {'baId': baId, 'prefix': prefix, if (nomorBatalId != null) 'nomorBatalId': nomorBatalId});

  /// v0.73.0: form dibuang = nomor pesanan langsung dilepas.
  Future<void> lepasNomor(Sesi s, String baId) => _api.call('lepasNomorGardu', token: s.token, data: {'baId': baId});

  /// OwnerId + External Reference otomatis dari section (tab OwnerId, algoritma v1).
  Future<Map<String, dynamic>> ownerId(Sesi s, String sectionId) =>
      _api.call('getOwnerIdGardu', token: s.token, data: {'sectionId': sectionId});

  /// Kirim satu foto (sudah JPEG). Hasil sha256 yang terkirim.
  /// [revisi] = foto pengganti untuk BA yang sudah tersimpan (v0.76.0, dipasang oleh [ubah]).
  Future<String> uploadFoto(Sesi s,
      {required String baId, required String jenis, required String slot, required String sumber, required Uint8List jpeg, bool revisi = false}) async {
    final sha = shaHexBa(jpeg);
    await _api.call('uploadFotoBaGardu', token: s.token, timeout: const Duration(seconds: 90), data: {
      'baId': baId,
      'jenis': jenis,
      'slot': slot,
      'sumber': sumber,
      'sha256': sha,
      'ukuranByte': jpeg.length,
      'data': base64Encode(jpeg),
      if (revisi) 'revisi': true,
    });
    return sha;
  }

  /// v0.76.0: isian lengkap satu BA (form edit).
  Future<Map<String, dynamic>> detail(Sesi s, String baId) => _api.call('getBaGardu', token: s.token, data: {'baId': baId});

  /// v0.76.0: foto BA lewat server (bukan link Drive).
  Future<Uint8List> foto(Sesi s, String baId, String slot, {bool penuh = true}) async {
    final r = await _api.call('getFotoBaGardu',
        token: s.token, timeout: const Duration(seconds: 90), data: {'baId': baId, 'slot': slot, 'ukuran': penuh ? 'PENUH' : 'KECIL'});
    return base64Decode('${r['data'] ?? ''}');
  }

  /// v0.76.0: bytes PDF lewat server (HP menampilkan / mengunduh tanpa membuka Drive).
  Future<({String namaFile, Uint8List bytes, String waktuPdf})> pdf(Sesi s, String baId) async {
    final r = await _api.call('getPdfBaGardu', token: s.token, timeout: const Duration(seconds: 120), data: {'baId': baId});
    return (namaFile: _t(r['namaFile']), bytes: base64Decode('${r['data'] ?? ''}'), waktuPdf: _t(r['waktuPdf']));
  }

  /// v0.76.0: koreksi isian BA tersimpan (nomor gardu / ID BA / No BA / Tanggal BA tetap).
  Future<Map<String, dynamic>> ubah(Sesi s, Map<String, dynamic> isi) =>
      _api.call('ubahBaGardu', token: s.token, timeout: const Duration(seconds: 90), data: isi);

  Future<Map<String, dynamic>> simpan(Sesi s, Map<String, dynamic> isi) =>
      _api.call('simpanBaGardu', token: s.token, timeout: const Duration(seconds: 90), data: isi);

  /// v0.71.0: buat / buat ulang PDF lewat Cloud Run. Cold start + 3 percobaan server bisa sampai ~1 menit lebih.
  Future<HasilPdfBa> buatPdf(Sesi s, String baId) async =>
      HasilPdfBa.dariJson(await _api.call('buatPdfBaGardu', token: s.token, timeout: const Duration(seconds: 180), data: {'baId': baId}));

  /// v0.71.0: daftar BA + status PDF. v0.78.0: filter urut / rentang Tanggal BA / jenis / tahap, ringkasan jumlah per tahap.
  /// v0.86.0: satu halaman dengan arsip BA v1 (filter sumber), [mulai] = halaman berikutnya.
  Future<({int jumlah, Map<String, int> ringkasan, List<ItemBa> isi, bool arsipAda})> daftar(Sesi s,
      {FilterBa filter = const FilterBa(), int mulai = 0, int batas = 100}) async {
    final r = await _api.call('getDaftarBaGardu', token: s.token, data: {...filter.keData(), if (mulai > 0) 'mulai': mulai, 'batas': batas});
    final isi = (r['isi'] as List<dynamic>? ?? const <dynamic>[]).whereType<Map<String, dynamic>>().map(ItemBa.dariJson).toList();
    final rk = r['ringkasan'];
    final ringkasan = <String, int>{
      if (rk is Map) for (final e in rk.entries) '${e.key}': (e.value as num?)?.toInt() ?? 0,
    };
    return (jumlah: (r['jumlah'] as num?)?.toInt() ?? isi.length, ringkasan: ringkasan, isi: isi, arsipAda: r['arsipAda'] == true);
  }

  /// v0.78.0 / v0.98.4: upload BA yang sudah ditandatangani (wajib PDF <= 10 MB), dikirim per bagian 2 MB (batas body server).
  /// [onProgres] dipanggil (bagian terkirim, jumlah bagian).
  Future<Map<String, dynamic>> uploadTtd(Sesi s,
      {required String baId, required Uint8List bytes, required String mime, required String namaFile, void Function(int ke, int dari)? onProgres}) async {
    if (bytes.isEmpty) throw StateError('File kosong');
    if (mime != 'application/pdf' || mimeTtdBa(bytes) != 'application/pdf') throw StateError('File BA TTD harus berformat PDF.');
    if (bytes.length > ttdBaMaksByte) throw StateError('File BA TTD maksimal 10 MB');
    final bagian = potongTtdBa(bytes);
    final sha = shaHexBa(bytes);
    final uploadId = const Uuid().v4();
    Map<String, dynamic> hasil = const {};
    for (var i = 0; i < bagian.length; i++) {
      onProgres?.call(i, bagian.length);
      hasil = await _api.call('uploadTtdBaGardu', token: s.token, timeout: const Duration(seconds: 120), data: {
        'baId': baId,
        'uploadId': uploadId,
        'ke': i + 1,
        'dari': bagian.length,
        'mime': mime,
        'namaFile': namaFile.length > 120 ? namaFile.substring(namaFile.length - 120) : namaFile,
        'sha256': sha,
        'ukuranByte': bytes.length,
        'data': base64Encode(bagian[i]),
      });
    }
    onProgres?.call(bagian.length, bagian.length);
    return hasil;
  }

  /// v0.78.0: bytes BA TTD lewat server (tanpa link Drive).
  Future<({String namaFile, String mime, Uint8List bytes, String waktuTtd})> ttd(Sesi s, String baId) async {
    final r = await _api.call('getTtdBaGardu', token: s.token, timeout: const Duration(seconds: 120), data: {'baId': baId});
    return (namaFile: _t(r['namaFile']), mime: _t(r['mime']), bytes: base64Decode('${r['data'] ?? ''}'), waktuTtd: _t(r['waktuTtd']));
  }

  /// v0.78.0: teks WA EAM format v1 (file BA TTD dilampirkan HP). Server mencatat waktu kirim.
  Future<Map<String, dynamic>> kirimEam(Sesi s, String baId) => _api.call('kirimEamBaGardu', token: s.token, data: {'baId': baId});

  /// v0.78.0: terapkan isian BA ke Master Gardu (db_Gardu). Syarat BA TTD sudah diupload.
  Future<Map<String, dynamic>> updateMaster(Sesi s, String baId) =>
      _api.call('updateMasterGarduBa', token: s.token, timeout: const Duration(seconds: 60), data: {'baId': baId});
}

/// Batas file BA TTD (server BA_TTD_MAKS_BYTE_) + ukuran satu bagian kiriman (BA_TTD_BAGIAN_MAKS_).
const int ttdBaMaksByte = 10 * 1024 * 1024;
const int ttdBaBagian = 2 * 1024 * 1024;

/// Potong file per 2 MB (bagian terakhir boleh lebih kecil, server mewajibkan bagian lain tepat 2 MB).
List<Uint8List> potongTtdBa(Uint8List b) => [
      for (var i = 0; i < b.length; i += ttdBaBagian) Uint8List.sublistView(b, i, math.min(i + ttdBaBagian, b.length)),
    ];

/// Jenis file dari bytes awal (wajib PDF %PDF). Kosong = bukan PDF.
String mimeTtdBa(Uint8List b) {
  if (b.length > 4 && b[0] == 0x25 && b[1] == 0x50 && b[2] == 0x44 && b[3] == 0x46) return 'application/pdf';
  return '';
}

/// v0.78.0: tahap alur BA (kolom gabungan server tahapBa_).
class TahapAlurBa {
  TahapAlurBa._();
  static const draft = 'DRAFT';
  static const prosesTtd = 'PROSES_TTD';
  static const ttdUlang = 'TTD_ULANG';
  static const selesaiTtd = 'SELESAI_TTD';
  static const batal = 'BATAL';
  static const semua = [draft, prosesTtd, ttdUlang, selesaiTtd, batal];

  static String label(String t) => switch (t) {
        draft => 'Draft BA',
        prosesTtd => 'Proses TTD',
        ttdUlang => 'Perlu TTD Ulang',
        selesaiTtd => 'Selesai TTD',
        batal => 'Batal',
        _ => t,
      };

  /// Penjelasan singkat untuk petugas.
  static String arti(String t) => switch (t) {
        draft => 'PDF BA belum dibuat',
        prosesTtd => 'PDF siap, menunggu BA bertanda tangan',
        ttdUlang => 'PDF dibuat ulang / BA diedit, upload BA TTD baru',
        selesaiTtd => 'BA TTD sudah diupload',
        batal => 'BA dibatalkan',
        _ => '',
      };
}

/// v0.78.0: filter Daftar BA. Kosong = semua, terbaru dulu.
class FilterBa {
  const FilterBa({this.cari = '', this.terlama = false, this.dari, this.sampai, this.jenis, this.tahap, this.sumber});
  final String cari;
  final bool terlama;
  final String? dari; // yyyy-MM-dd (Tanggal BA)
  final String? sampai;
  final String? jenis;
  final String? tahap;

  /// v0.86.0: null = semua (BA v2 + arsip v1), 'V2' = SiSi v2 saja, 'V1' = arsip v1 saja.
  final String? sumber;

  Map<String, dynamic> keData() => {
        'sumber': sumber ?? 'SEMUA',
        if (cari.trim().isNotEmpty) 'cari': cari.trim(),
        'urut': terlama ? 'TERLAMA' : 'TERBARU',
        if (dari != null) 'dari': dari,
        if (sampai != null) 'sampai': sampai,
        if (jenis != null) 'jenis': jenis,
        if (tahap != null) 'tahap': tahap,
      };

  /// Jumlah filter lanjutan aktif (urut terlama, rentang, jenis). Cari + tahap tampil terpisah.
  int get jumlahAktif => (terlama ? 1 : 0) + (dari != null || sampai != null ? 1 : 0) + (jenis != null ? 1 : 0);

  FilterBa salin(
          {String? cari,
          bool? terlama,
          String? Function()? dari,
          String? Function()? sampai,
          String? Function()? jenis,
          String? Function()? tahap,
          String? Function()? sumber}) =>
      FilterBa(
        cari: cari ?? this.cari,
        terlama: terlama ?? this.terlama,
        dari: dari != null ? dari() : this.dari,
        sampai: sampai != null ? sampai() : this.sampai,
        jenis: jenis != null ? jenis() : this.jenis,
        tahap: tahap != null ? tahap() : this.tahap,
        sumber: sumber != null ? sumber() : this.sumber,
      );
}

String _t(Object? v) => v == null ? '' : '$v';

/// Jawaban buatPdfBaGardu.
class HasilPdfBa {
  const HasilPdfBa({required this.statusPdf, required this.urlPdf, required this.waktuPdf, required this.namaFile, required this.fotoHilang});
  final String statusPdf;
  final String urlPdf;
  final String waktuPdf;
  final String namaFile;
  final List<String> fotoHilang;

  factory HasilPdfBa.dariJson(Map<String, dynamic> j) => HasilPdfBa(
        statusPdf: _t(j['statusPdf']),
        urlPdf: _t(j['urlPdf']),
        waktuPdf: _t(j['waktuPdf']),
        namaFile: _t(j['namaFile']),
        fotoHilang: (j['fotoHilang'] as List<dynamic>? ?? const <dynamic>[]).map((e) => '$e').toList(),
      );
}

/// Satu baris Rekap_BA di daftar BA (getDaftarBaGardu).
class ItemBa {
  const ItemBa({
    required this.baId,
    required this.idBa,
    required this.noBaFull,
    required this.jenis,
    required this.noGardu,
    required this.tanggalBa,
    required this.penyulang,
    required this.statusBa,
    required this.statusPdf,
    required this.urlPdf,
    required this.waktuPdf,
    required this.pdfBisa,
    this.tahap = TahapAlurBa.draft,
    this.statusTtd = 'BELUM TTD',
    this.adaTtd = false,
    this.waktuTtd = '',
    this.eamTerakhir = '',
    this.eamKali = 0,
    this.masterTerakhir = '',
    this.arsip,
  });
  final String baId;
  final String idBa;
  final String noBaFull;
  final String jenis;
  final String noGardu;
  final String tanggalBa;
  final String penyulang;
  final String statusBa;
  final String statusPdf;
  final String urlPdf;
  final String waktuPdf;
  final bool pdfBisa;
  // v0.78.0: alur TTD / EAM / Master Gardu
  final String tahap;
  final String statusTtd; // BELUM TTD | SUDAH TTD | TTD ULANG
  final bool adaTtd;
  final String waktuTtd;
  final String eamTerakhir;
  final int eamKali;
  final String masterTerakhir;

  /// v0.86.0: BA lama dari arsip v1 (baca saja). null = BA SiSi v2.
  final ItemArsipBa? arsip;

  bool get ttdBerlaku => adaTtd && statusTtd == 'SUDAH TTD';
  bool get batal => statusBa == 'BATAL';

  bool get adaPdf => statusPdf == 'SELESAI' && urlPdf.startsWith('https://');

  factory ItemBa.dariJson(Map<String, dynamic> j) => ItemBa(
        baId: _t(j['baId']),
        idBa: _t(j['idBa']),
        noBaFull: _t(j['noBaFull']),
        jenis: _t(j['jenis']),
        noGardu: _t(j['noGardu']),
        tanggalBa: _t(j['tanggalBa']),
        penyulang: _t(j['penyulang']),
        statusBa: _t(j['statusBa']).isEmpty ? 'AKTIF' : _t(j['statusBa']),
        statusPdf: _t(j['statusPdf']).isEmpty ? 'BELUM' : _t(j['statusPdf']),
        urlPdf: _t(j['urlPdf']),
        waktuPdf: _t(j['waktuPdf']),
        pdfBisa: j['pdfBisa'] == true,
        tahap: _t(j['tahap']).isEmpty ? (_t(j['statusBa']) == 'BATAL' ? TahapAlurBa.batal : TahapAlurBa.draft) : _t(j['tahap']),
        statusTtd: _t(j['statusTtd']).isEmpty ? 'BELUM TTD' : _t(j['statusTtd']),
        adaTtd: j['adaTtd'] == true,
        waktuTtd: _t(j['waktuTtd']),
        eamTerakhir: _t(j['eamTerakhir']),
        eamKali: (j['eamKali'] as num?)?.toInt() ?? 0,
        masterTerakhir: _t(j['masterTerakhir']),
        arsip: j['arsip'] == true ? ItemArsipBa.dariJson(j) : null,
      );

  /// Salinan dengan ringkasan alur baru (jawaban upload TTD / kirim EAM / update master / detail).
  ItemBa denganInfo(Map<String, dynamic> j) => ItemBa(
        baId: baId,
        idBa: idBa,
        noBaFull: noBaFull,
        jenis: jenis,
        noGardu: noGardu,
        tanggalBa: tanggalBa,
        penyulang: penyulang,
        statusBa: statusBa,
        statusPdf: j.containsKey('statusPdf') ? (_t(j['statusPdf']).isEmpty ? 'BELUM' : _t(j['statusPdf'])) : statusPdf,
        urlPdf: j.containsKey('urlPdf') ? _t(j['urlPdf']) : urlPdf,
        waktuPdf: j.containsKey('waktuPdf') ? _t(j['waktuPdf']) : waktuPdf,
        pdfBisa: pdfBisa,
        tahap: j.containsKey('tahap') ? _t(j['tahap']) : tahap,
        statusTtd: j.containsKey('statusTtd') ? _t(j['statusTtd']) : statusTtd,
        adaTtd: j.containsKey('adaTtd') ? j['adaTtd'] == true : adaTtd,
        waktuTtd: j.containsKey('waktuTtd') ? _t(j['waktuTtd']) : waktuTtd,
        eamTerakhir: j.containsKey('eamTerakhir') ? _t(j['eamTerakhir']) : eamTerakhir,
        eamKali: j.containsKey('eamKali') ? (j['eamKali'] as num?)?.toInt() ?? 0 : eamKali,
        masterTerakhir: j.containsKey('masterTerakhir') ? _t(j['masterTerakhir']) : masterTerakhir,
        arsip: arsip,
      );

  ItemBa denganPdf(HasilPdfBa h) => ItemBa(
        baId: baId,
        idBa: idBa,
        noBaFull: noBaFull,
        jenis: jenis,
        noGardu: noGardu,
        tanggalBa: tanggalBa,
        penyulang: penyulang,
        statusBa: statusBa,
        statusPdf: h.statusPdf,
        urlPdf: h.urlPdf,
        waktuPdf: h.waktuPdf,
        pdfBisa: pdfBisa,
        // PDF baru sesudah TTD = TTD lama tidak berlaku (server menandai TTD ULANG)
        tahap: adaTtd ? TahapAlurBa.ttdUlang : TahapAlurBa.prosesTtd,
        statusTtd: adaTtd ? 'TTD ULANG' : statusTtd,
        adaTtd: adaTtd,
        waktuTtd: waktuTtd,
        eamTerakhir: eamTerakhir,
        eamKali: eamKali,
        masterTerakhir: masterTerakhir,
        arsip: arsip,
      );
}
