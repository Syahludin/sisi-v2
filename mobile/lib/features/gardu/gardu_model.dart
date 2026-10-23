import 'package:flutter/material.dart';

/// v0.69.0: satu gardu dari Master Gardu (getMaster modul `gardu`, sumber db_Gardu). Hanya AKTIF + TIDAK AKTIF.
class Gardu {
  const Gardu({
    required this.id,
    required this.no,
    required this.prefix,
    required this.status,
    required this.alamat,
    required this.penyulang,
    required this.section,
    required this.sectionId,
    required this.ptsLbs,
    required this.lat,
    required this.lng,
    required this.konstruksi,
    required this.kva,
    required this.merk,
    required this.seri,
    required this.tahun,
    required this.jurusan,
    required this.asalTrafo,
    required this.merkPhb,
    required this.seriPhb,
    required this.tahunPhb,
    required this.kepemilikan,
    required this.ownerId,
    required this.extRef,
    required this.baOperasi,
    required this.tglOperasi,
    required this.baTerakhir,
    required this.jenisBaTerakhir,
    required this.tglBaTerakhir,
    required this.jumlahBa,
    required this.tglUkur,
    required this.arusMaks,
    required this.bebanKva,
    required this.persen,
    required this.waktuBeban,
    required this.revision,
    this.ukur = const {},
    this.sumberUkur = '',
    this.kodeUkur = '',
  });

  final String id;
  final String no;
  final String prefix;
  final String status;
  final String alamat;
  final String penyulang;
  final String section;
  final String sectionId;
  final String ptsLbs;
  final double? lat;
  final double? lng;
  final String konstruksi;
  final double? kva;
  final String merk;
  final String seri;
  final int? tahun;
  final String jurusan;
  final String asalTrafo;
  final String merkPhb;
  final String seriPhb;
  final int? tahunPhb;
  final String kepemilikan;
  final String ownerId;
  final String extRef;
  final String baOperasi;
  final String tglOperasi;
  final String baTerakhir;
  final String jenisBaTerakhir;
  final String tglBaTerakhir;
  final int jumlahBa;
  final String tglUkur;
  final double? arusMaks;
  final double? bebanKva;
  final double? persen;
  final String waktuBeban;
  final int revision;

  /// v1.0.17: arus per fasa + tegangan pengukuran terakhir (kunci [kolomUkurGardu]); kosong = belum ada.
  final Map<String, double?> ukur;
  final String sumberUkur;
  final String kodeUkur; // v1.0.22: Kode Ukur Terakhir (kartu Pengukuran Terbaru)

  /// v1.0.17: urutan + label kolom arus / tegangan rincian Pengukuran Gardu.
  static const kolomUkurGardu = [
    ('bebanR', 'Arus R', 'A'), ('bebanS', 'Arus S', 'A'), ('bebanT', 'Arus T', 'A'), ('bebanN', 'Arus N', 'A'),
    ('teganganRN', 'Tegangan R-N', 'V'), ('teganganSN', 'Tegangan S-N', 'V'), ('teganganTN', 'Tegangan T-N', 'V'),
    ('teganganRS', 'Tegangan R-S', 'V'), ('teganganRT', 'Tegangan R-T', 'V'), ('teganganST', 'Tegangan S-T', 'V'),
  ];

  bool get aktif => status == 'AKTIF';
  bool get adaKoordinat => lat != null && lng != null;
  KategoriBeban get kategori => KategoriBeban.dari(persen);

  /// v0.98.13: salinan gardu dengan data pengukuran terbaru (dari yan_Gardu 2 hari terakhir / P0 lokal).
  Gardu denganUkurTerbaru({
    required String tglUkur,
    double? arusMaks,
    double? bebanKva,
    double? persen,
    String? waktuBeban,
  }) =>
      Gardu(
        id: id,
        no: no,
        prefix: prefix,
        status: status,
        alamat: alamat,
        penyulang: penyulang,
        section: section,
        sectionId: sectionId,
        ptsLbs: ptsLbs,
        lat: lat,
        lng: lng,
        konstruksi: konstruksi,
        kva: kva,
        merk: merk,
        seri: seri,
        tahun: tahun,
        jurusan: jurusan,
        asalTrafo: asalTrafo,
        merkPhb: merkPhb,
        seriPhb: seriPhb,
        tahunPhb: tahunPhb,
        kepemilikan: kepemilikan,
        ownerId: ownerId,
        extRef: extRef,
        baOperasi: baOperasi,
        tglOperasi: tglOperasi,
        baTerakhir: baTerakhir,
        jenisBaTerakhir: jenisBaTerakhir,
        tglBaTerakhir: tglBaTerakhir,
        jumlahBa: jumlahBa,
        tglUkur: tglUkur,
        arusMaks: arusMaks ?? this.arusMaks,
        bebanKva: bebanKva ?? this.bebanKva,
        persen: persen ?? this.persen,
        waktuBeban: waktuBeban ?? this.waktuBeban,
        revision: revision,
        ukur: ukur,
        sumberUkur: sumberUkur,
        kodeUkur: kodeUkur,
      );

  /// Teks yang dicari kotak pencarian (No Gardu, alamat, penyulang, section, merk).
  String get kunciCari => '$no $alamat $penyulang $section $ptsLbs $merk'.toLowerCase();

  static String _t(Object? v) => v == null ? '' : '$v'.trim();
  static double? _d(Object? v) => v is num ? v.toDouble() : double.tryParse(_t(v).replaceAll(',', '.'));
  static int? _i(Object? v) => _d(v)?.round();

  factory Gardu.dariJson(Map<String, dynamic> j) => Gardu(
        id: _t(j['id']),
        no: _t(j['no']).toUpperCase(),
        prefix: _t(j['prefix']),
        status: _t(j['status']).toUpperCase(),
        alamat: _t(j['alamat']),
        penyulang: _t(j['penyulang']),
        section: _t(j['section']),
        sectionId: _t(j['sectionId']),
        ptsLbs: _t(j['ptsLbs']),
        lat: _d(j['lat']),
        lng: _d(j['lng']),
        konstruksi: _t(j['konstruksi']),
        kva: _d(j['kva']),
        merk: _t(j['merk']),
        seri: _t(j['seri']),
        tahun: _i(j['tahun']),
        jurusan: _t(j['jurusan']),
        asalTrafo: _t(j['asalTrafo']),
        merkPhb: _t(j['merkPhb']),
        seriPhb: _t(j['seriPhb']),
        tahunPhb: _i(j['tahunPhb']),
        kepemilikan: _t(j['kepemilikan']),
        ownerId: _t(j['ownerId']),
        extRef: _t(j['extRef']),
        baOperasi: _t(j['baOperasi']),
        tglOperasi: _t(j['tglOperasi']),
        baTerakhir: _t(j['baTerakhir']),
        jenisBaTerakhir: _t(j['jenisBaTerakhir']),
        tglBaTerakhir: _t(j['tglBaTerakhir']),
        jumlahBa: _i(j['jumlahBa']) ?? 0,
        tglUkur: _t(j['tglUkur']),
        arusMaks: _d(j['arusMaks']),
        bebanKva: _d(j['bebanKva']),
        persen: _d(j['persen']),
        waktuBeban: _t(j['waktuBeban']),
        revision: _i(j['revision']) ?? 0,
        ukur: j['ukur'] is Map ? {for (final e in (j['ukur'] as Map).entries) '${e.key}': _d(e.value)} : const {},
        sumberUkur: _t(j['sumberUkur']),
        kodeUkur: _t(j['kodeUkur']),
      );
}

/// Kategori beban trafo, range sama v1 (gardu_card_widgets) dan server (kategoriBeban_).
enum KategoriBeban {
  underload('Underload', '< 50%', Color(0xFF16A34A), Color(0xFFDCFCE7)),
  cukup('Cukup', '50 - 79%', Color(0xFF0284C7), Color(0xFFE0F2FE)),
  overload('Overload', '80 - 99%', Color(0xFFB45309), Color(0xFFFEF3C7)),
  buruk('Buruk', '>= 100%', Color(0xFFDC2626), Color(0xFFFEE2E2)),
  belum('Belum Diukur', 'tanpa data', Color(0xFF64748B), Color(0xFFF1F5F9));

  const KategoriBeban(this.label, this.range, this.warna, this.latar);
  final String label;
  final String range;
  final Color warna;
  final Color latar;

  static KategoriBeban dari(double? persen) {
    if (persen == null || persen.isNaN) return KategoriBeban.belum;
    if (persen < 50) return KategoriBeban.underload;
    if (persen < 80) return KategoriBeban.cukup;
    if (persen < 100) return KategoriBeban.overload;
    return KategoriBeban.buruk;
  }
}

enum UrutGardu {
  nomor('No Gardu'),
  bebanTinggi('Beban tertinggi'),
  bebanRendah('Beban terendah'),
  ukurLama('Ukur paling lama');

  const UrutGardu(this.label);
  final String label;
}

/// Saringan layar Pengukuran Gardu (murni, bisa dites tanpa Flutter UI).
class SaringGardu {
  const SaringGardu({
    this.kata = '',
    this.kategori = const {},
    this.penyulang,
    this.kva,
    this.minPersen,
    this.maxPersen,
    this.urut = UrutGardu.nomor,
    this.tidakAktif = false,
  });

  final String kata;
  final Set<KategoriBeban> kategori;
  final String? penyulang;
  final double? kva;
  final double? minPersen;
  final double? maxPersen;
  final UrutGardu urut;

  /// false = hanya AKTIF (default); true = hanya TIDAK AKTIF.
  final bool tidakAktif;

  bool get adaSaring =>
      kata.trim().isNotEmpty || kategori.isNotEmpty || penyulang != null || kva != null || minPersen != null || maxPersen != null;

  SaringGardu salin({
    String? kata,
    Set<KategoriBeban>? kategori,
    String? Function()? penyulang,
    double? Function()? kva,
    double? Function()? minPersen,
    double? Function()? maxPersen,
    UrutGardu? urut,
    bool? tidakAktif,
  }) =>
      SaringGardu(
        kata: kata ?? this.kata,
        kategori: kategori ?? this.kategori,
        penyulang: penyulang != null ? penyulang() : this.penyulang,
        kva: kva != null ? kva() : this.kva,
        minPersen: minPersen != null ? minPersen() : this.minPersen,
        maxPersen: maxPersen != null ? maxPersen() : this.maxPersen,
        urut: urut ?? this.urut,
        tidakAktif: tidakAktif ?? this.tidakAktif,
      );

  /// Gardu sesuai status (tanpa saringan lain), dasar hitungan ringkasan kategori.
  List<Gardu> dasar(List<Gardu> semua) => semua.where((g) => tidakAktif ? g.status == 'TIDAK AKTIF' : g.aktif).toList();

  List<Gardu> terapkan(List<Gardu> semua) {
    final k = kata.trim().toLowerCase();
    final hasil = dasar(semua).where((g) {
      if (k.isNotEmpty && !g.kunciCari.contains(k)) return false;
      if (kategori.isNotEmpty && !kategori.contains(g.kategori)) return false;
      if (penyulang != null && g.penyulang.toLowerCase() != penyulang!.toLowerCase()) return false;
      if (kva != null && (g.kva == null || (g.kva! - kva!).abs() > .001)) return false;
      if (minPersen != null && (g.persen == null || g.persen! < minPersen!)) return false;
      if (maxPersen != null && (g.persen == null || g.persen! > maxPersen!)) return false;
      return true;
    }).toList();
    int banding(Gardu a, Gardu b) {
      switch (urut) {
        case UrutGardu.nomor:
          return a.no.compareTo(b.no);
        case UrutGardu.bebanTinggi:
          return (b.persen ?? -1).compareTo(a.persen ?? -1);
        case UrutGardu.bebanRendah:
          return (a.persen ?? double.infinity).compareTo(b.persen ?? double.infinity);
        case UrutGardu.ukurLama:
          final ta = a.tglUkur.isEmpty ? '0000' : a.tglUkur, tb = b.tglUkur.isEmpty ? '0000' : b.tglUkur;
          return ta.compareTo(tb);
      }
    }

    hasil.sort((a, b) {
      final c = banding(a, b);
      return c != 0 ? c : a.no.compareTo(b.no);
    });
    return hasil;
  }
}

/// Jumlah gardu per kategori (urutan enum).
Map<KategoriBeban, int> hitungKategori(List<Gardu> daftar) {
  final h = {for (final k in KategoriBeban.values) k: 0};
  for (final g in daftar) {
    h[g.kategori] = (h[g.kategori] ?? 0) + 1;
  }
  return h;
}

/// Teks angka ringkas Indonesia: 85.3 -> "85,3", 100.0 -> "100", null -> "-".
String angkaId(double? v, {int desimal = 1}) {
  if (v == null) return '-';
  final bulat = v.roundToDouble() == v;
  return (bulat ? v.toStringAsFixed(0) : v.toStringAsFixed(desimal)).replaceAll('.', ',');
}

/// v0.98.13: gabungkan Master Gardu dengan daftar pengukuran terbaru (yan_Gardu 2 hari terakhir + P0 lokal shift ini)
/// supaya tanggal ukur & hasil ukur selalu paling mutakhir walau Master Gardu belum diunduh ulang.
List<Gardu> gabungGarduUkurTerbaru(
  List<Gardu> master,
  List<Map<String, dynamic>> terbaru, {
  List<({String garduId, String noGardu, String tanggal, double? kva, double? bebanKva, double? persen, String? waktuBeban, String? penyulang, String? section, String? alamat})> lokal = const [],
}) {
  final petaId = <String, Map<String, dynamic>>{};
  final petaNo = <String, Map<String, dynamic>>{};
  void catat(Map<String, dynamic> m) {
    final tgl = '${m['tanggal'] ?? ''}'.trim();
    if (tgl.length < 10) return;
    final t = tgl.substring(0, 10);
    final gid = '${m['garduId'] ?? ''}'.trim();
    final no = '${m['noGardu'] ?? ''}'.trim().toUpperCase();
    if (gid.isNotEmpty) {
      final lama = '${petaId[gid]?['tanggal'] ?? ''}';
      if (lama.isEmpty || t.compareTo(lama) >= 0) petaId[gid] = {...m, 'tanggal': t};
    }
    if (no.isNotEmpty) {
      final lama = '${petaNo[no]?['tanggal'] ?? ''}';
      if (lama.isEmpty || t.compareTo(lama) >= 0) petaNo[no] = {...m, 'tanggal': t};
    }
  }

  for (final x in terbaru) {
    catat(x);
  }
  for (final l in lokal) {
    catat({
      'garduId': l.garduId,
      'noGardu': l.noGardu,
      'tanggal': l.tanggal,
      if (l.kva != null) 'kva': l.kva,
      if (l.bebanKva != null) 'bebanKva': l.bebanKva,
      if (l.persen != null) 'persen': l.persen,
      if (l.waktuBeban != null) 'waktuBeban': l.waktuBeban,
      if (l.penyulang != null) 'penyulang': l.penyulang,
      if (l.section != null) 'section': l.section,
      if (l.alamat != null) 'alamat': l.alamat,
    });
  }

  double? ang(Object? v) => v is num ? v.toDouble() : double.tryParse('${v ?? ''}'.replaceAll(',', '.'));
  final adaNo = <String>{};
  final hasil = <Gardu>[];
  for (final g in master) {
    adaNo.add(g.no.toUpperCase());
    final u = petaId[g.id] ?? petaNo[g.no.toUpperCase()];
    if (u == null) {
      hasil.add(g);
      continue;
    }
    final tBaru = '${u['tanggal'] ?? ''}';
    final tLama = g.tglUkur.length >= 10 ? g.tglUkur.substring(0, 10) : g.tglUkur;
    if (tBaru.isNotEmpty && (tLama.isEmpty || tBaru.compareTo(tLama) >= 0)) {
      hasil.add(g.denganUkurTerbaru(
        tglUkur: tBaru,
        bebanKva: ang(u['bebanKva']),
        persen: ang(u['persen']),
        waktuBeban: '${u['waktuBeban'] ?? ''}'.trim().isEmpty ? null : '${u['waktuBeban']}'.trim(),
      ));
    } else {
      hasil.add(g);
    }
  }
  // Jika Master Gardu belum diunduh sama sekali atau gardu belum ada di lokal, tampilkan dari data ukurTerbaru
  for (final e in petaNo.entries) {
    if (adaNo.contains(e.key)) continue;
    final u = e.value;
    hasil.add(Gardu.dariJson({
      'id': '${u['garduId'] ?? e.key}',
      'no': e.key,
      'status': 'AKTIF',
      'alamat': '${u['alamat'] ?? ''}',
      'penyulang': '${u['penyulang'] ?? ''}',
      'section': '${u['section'] ?? ''}',
      'kva': u['kva'],
      'tglUkur': '${u['tanggal'] ?? ''}',
      'bebanKva': u['bebanKva'],
      'persen': u['persen'],
      'waktuBeban': '${u['waktuBeban'] ?? ''}',
    }));
  }
  return hasil;
}
