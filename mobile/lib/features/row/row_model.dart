/// Salinan lokal data ROW (tabel row_header / row_realisasi / row_eksekusi). Pure Dart.
/// `sinkron`: LOKAL (belum diterima server) | TERKIRIM | KONFLIK | DITOLAK.
class RowHeader {
  RowHeader(this.m);
  final Map<String, Object?> m;

  String get id => m['id'] as String;
  String get kode => m['kode'] as String;
  String get tanggal => m['tanggal'] as String;
  String? get koordinatAwal => _teks(m['koordinat_awal']);
  String? get koordinatAkhir => _teks(m['koordinat_akhir']);
  num? get kmAwal => m['km_awal'] as num?;
  num? get kmAkhir => m['km_akhir'] as num?;
  String? get kendala => _teks(m['kendala']);
  String? get waText => _teks(m['wa_text']);
  bool get waSiap => (m['wa_siap'] as int? ?? 0) == 1 && waText != null;
  String get status => m['status'] as String;
  int get revision => (m['revision'] as int?) ?? 0;
  String get sinkron => m['sinkron'] as String;
  String? get alasan => m['alasan'] as String?;
  bool get aktif => status == 'AKTIF';

  /// Syarat WA (keputusan 3 Okt 2026): koordinat awal/akhir + KM awal/akhir terisi. Kendala opsional.
  List<String> get kurangUntukWa => [
        if (koordinatAwal == null) 'Koordinat awal',
        if (koordinatAkhir == null) 'Koordinat akhir',
        if (kmAwal == null) 'KM awal',
        if (kmAkhir == null) 'KM akhir',
      ];
}

class RowRealisasi {
  RowRealisasi(this.m);
  final Map<String, Object?> m;

  String get id => m['id'] as String;
  String get headerId => m['header_id'] as String;
  String get kode => m['kode'] as String;
  String get penyulang => m['penyulang'] as String;
  String get status => m['status'] as String;
  int get revision => (m['revision'] as int?) ?? 0;
  String get sinkron => m['sinkron'] as String;
  String? get alasan => m['alasan'] as String?;
  bool get aktif => status == 'AKTIF';
}

class RowEksekusi {
  RowEksekusi(this.m);
  final Map<String, Object?> m;

  String get id => m['id'] as String;
  String get realisasiId => m['realisasi_id'] as String;
  String get kode => m['kode'] as String;
  String get sectionId => m['section_id'] as String;
  String get section => (m['section'] as String?) ?? '-';
  String? get nomorTiang => _teks(m['nomor_tiang']);
  String? get koordinatTiang => _teks(m['koordinat_tiang']);
  String? get koordinatPekerjaan => _teks(m['koordinat_pekerjaan']);
  int? get diameter => m['diameter'] as int?;
  String? get jenisNama => m['jenis_nama'] as String?;
  String? get jenisId => m['jenis_id'] as String?;
  bool get fotoLengkap => (m['foto_lengkap'] as int? ?? 0) == 1;
  String get status => m['status'] as String;
  int get revision => (m['revision'] as int?) ?? 0;
  String get sinkron => m['sinkron'] as String;
  String? get alasan => m['alasan'] as String?;
  bool get aktif => status == 'AKTIF';
}

String? _teks(Object? v) {
  if (v == null) return null;
  final s = v.toString().trim();
  return s.isEmpty ? null : s;
}

/// Koordinat "lat, lng" (sama dengan parseKoordinat_ di server, area Bangka Belitung).
class Koordinat {
  Koordinat._();

  static final RegExp _pola = RegExp(r'^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$');

  /// null = valid. Selain itu pesan untuk petugas.
  static String? cek(String? v, {bool wajib = false}) {
    final s = (v ?? '').trim();
    if (s.isEmpty) return wajib ? 'Wajib diisi' : null;
    final m = _pola.firstMatch(s);
    if (m == null) return 'Format: lat, lng (contoh -3.012345, 106.512345)';
    final lat = double.parse(m.group(1)!), lng = double.parse(m.group(2)!);
    if (lat < -3.6 || lat > -1.3 || lng < 105.0 || lng > 109.0) return 'Di luar area Bangka Belitung';
    return null;
  }

  static String format(double lat, double lng) => '${lat.toStringAsFixed(6)}, ${lng.toStringAsFixed(6)}';
}
