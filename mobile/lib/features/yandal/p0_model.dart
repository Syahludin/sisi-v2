/// v0.64.0 (keputusan kvlar 8 Okt 2026): Penugasan P0 shift berjalan di HP (pure Dart, bisa dites tanpa Flutter).
/// Tahap mengikuti v1: foto Sebelum = memulai pekerjaan, foto Pekerjaan = proses, foto Sesudah = P0 selesai.
/// "Sedang dikerjakan" = belum ada foto Sesudah (status PROSES), "Sudah dikerjakan" = ada (status SELESAI).
library;

import 'dart:math' as math;

const List<String> slotP0 = ['SEBELUM', 'PEKERJAAN', 'SESUDAH'];
const Map<String, String> labelSlotP0 = {'SEBELUM': 'Sebelum', 'PEKERJAAN': 'Pekerjaan', 'SESUDAH': 'Sesudah'};
const String pekerjaanLainLain = 'Lain - Lain';

// ---------------- v0.66.0: Pengecekan Switching (anak P0) ----------------
const String pekerjaanSwitching = 'Pengecekan Switching';
const List<String> slotSwitching = ['ARUS', 'GANGGUAN_1', 'GANGGUAN_2', 'GANGGUAN_3', 'GANGGUAN_4', 'GANGGUAN_5'];
const Map<String, String> labelSlotSwitching = {
  'ARUS': 'Arus',
  'GANGGUAN_1': 'Arus Gangguan 1',
  'GANGGUAN_2': 'Arus Gangguan 2',
  'GANGGUAN_3': 'Arus Gangguan 3',
  'GANGGUAN_4': 'Arus Gangguan 4',
  'GANGGUAN_5': 'Arus Gangguan 5',
};
const List<String> pilihanIndikator = ['Nyala', 'Padam'];
const List<String> namaIndikator = ['Remote', 'Local', 'Protection', 'Reclose'];

String _kunciNama(String v) => v.trim().replaceAll(RegExp(r'\s+'), ' ').toLowerCase();

/// P0 ini Pengecekan Switching (huruf besar / kecil bebas), sama dengan p0Switching_ server.
bool p0Switching(String namaPekerjaan) => _kunciNama(namaPekerjaan) == _kunciNama(pekerjaanSwitching);

/// Nama Switching = bagian depan nama section sebelum " - " ("LBS A - LBS B" = "LBS A"), sama dengan server.
String namaSwitching(String section) {
  final s = section.trim();
  final i = s.indexOf(' - ');
  return (i == -1 ? s : s.substring(0, i)).trim();
}

/// Hanya LBS / ACR (keputusan kvlar 9 Okt 2026), sama dengan switchingSah_ server.
bool switchingSah(String nama) => RegExp(r'^(LBS|ACR)(\b|[^A-Za-z])', caseSensitive: false).hasMatch(nama.trim());

/// v0.66.4: section yang boleh dipilih untuk pekerjaan ini. Pengecekan Switching = hanya section berawalan LBS / ACR
/// (Nama Switching diambil dari section P0); pekerjaan lain = semua section penyulang.
List<({String id, String nama})> sectionUntukPekerjaan(List<({String id, String nama})> semua, String namaPekerjaan) =>
    p0Switching(namaPekerjaan) ? [for (final e in semua) if (switchingSah(namaSwitching(e.nama))) e] : semua;

/// Satu pengecekan switching di HP (disimpan di dalam JSON P0 induk).
/// Sesudah disimpan: section / indikator / catatan terkunci, Arus R/S/T boleh diubah selama P0 belum selesai.
/// Foto (ARUS dulu, lalu GANGGUAN_1..5 opsional) langsung terkunci dari review kamera.
class SwitchingLokal {
  const SwitchingLokal({
    required this.id,
    required this.no,
    required this.sectionId,
    required this.section,
    required this.indikator,
    required this.arusR,
    required this.arusS,
    required this.arusT,
    this.catatan = '',
    required this.dibuat,
    this.foto = const {},
    this.kodeResmi = '',
    this.arusTerkirim,
    this.disimpan = true,
    this.isianDraf = const {},
  });

  final String id;
  final int no;
  final String sectionId;
  final String section;
  final Map<String, String> indikator; // Remote / Local / Protection / Reclose -> Nyala | Padam
  final double arusR;
  final double arusS;
  final double arusT;
  final String catatan;
  final DateTime dibuat;
  final Map<String, FotoP0> foto;
  final String kodeResmi; // <Kode P0>-SWC.nnn dari server
  /// Arus R/S/T yang terakhir diterima server. null = data belum terkirim.
  final List<double>? arusTerkirim;

  /// v0.75.0 (permintaan kvlar 10 Okt 2026): foto boleh diambil SEBELUM data disimpan. false = draf (foto sudah ada,
  /// indikator / arus belum disimpan, belum dikirim). Tombol Simpan menyimpan data + foto bersamaan.
  final bool disimpan;

  /// Isian draf apa adanya (teks kolom R / S / T / catatan) supaya tidak hilang saat layar ditutup.
  final Map<String, String> isianDraf;

  String get nama => namaSwitching(section);
  List<double> get arus => [arusR, arusS, arusT];
  bool get adaFotoArus => foto['ARUS']?.terkunci ?? false;

  /// Data (bukan foto) perlu dikirim: baru, atau arus diubah sesudah terkirim.
  bool get perluKirimData {
    final t = arusTerkirim;
    return t == null || t.length != 3 || t[0] != arusR || t[1] != arusS || t[2] != arusT;
  }

  /// Draf tidak pernah dikirim (server baru menerima sesudah Simpan Switching).
  bool get perluKirim =>
      disimpan && (perluKirimData || slotSwitching.any((s) => foto[s] != null && foto[s]!.terkunci && !foto[s]!.terkirim));

  String kodeTampil(P0Lokal induk) =>
      kodeResmi.isNotEmpty ? kodeResmi : '${induk.kodeWatermark} SWC #${no.toString().padLeft(3, '0')}';

  /// v0.75.0: semua foto langsung bisa diambil (urutan bebas); yang sudah ada tidak bisa diambil ulang.
  /// Foto Arus tetap wajib sebelum Simpan Switching (server menerima Arus lebih dulu).
  bool bolehFoto(String slot) => slotSwitching.contains(slot) && foto[slot] == null;

  String? alasanBelumBoleh(String slot) {
    if (foto[slot] != null) return 'Foto ${labelSlotSwitching[slot]} sudah disimpan, tidak bisa diambil ulang.';
    return null;
  }

  SwitchingLokal _salin({double? arusR, double? arusS, double? arusT, Map<String, FotoP0>? foto, String? kodeResmi,
          List<double>? arusTerkirim, bool hapusTerkirim = false, Map<String, String>? indikator, String? catatan,
          DateTime? dibuat, bool? disimpan, Map<String, String>? isianDraf}) =>
      SwitchingLokal(
        id: id,
        no: no,
        sectionId: sectionId,
        section: section,
        indikator: indikator ?? this.indikator,
        arusR: arusR ?? this.arusR,
        arusS: arusS ?? this.arusS,
        arusT: arusT ?? this.arusT,
        catatan: catatan ?? this.catatan,
        dibuat: dibuat ?? this.dibuat,
        foto: foto ?? this.foto,
        kodeResmi: kodeResmi ?? this.kodeResmi,
        arusTerkirim: hapusTerkirim ? null : (arusTerkirim ?? this.arusTerkirim),
        disimpan: disimpan ?? this.disimpan,
        isianDraf: isianDraf ?? this.isianDraf,
      );

  /// Draf: simpan isian sementara (indikator yang sudah dipilih + teks kolom).
  SwitchingLokal denganDraf(Map<String, String> indikator, Map<String, String> isian) =>
      _salin(indikator: Map.of(indikator), isianDraf: Map.of(isian));

  /// Draf jadi data tersimpan (Simpan Switching): indikator, arus, catatan, jam simpan.
  SwitchingLokal disimpanDari({required Map<String, String> indikator, required double arusR, required double arusS,
          required double arusT, required String catatan, required DateTime dibuat}) =>
      _salin(indikator: Map.of(indikator), arusR: arusR, arusS: arusS, arusT: arusT, catatan: catatan, dibuat: dibuat,
          disimpan: true, isianDraf: const {});

  SwitchingLokal denganArus(double r, double s, double t) => _salin(arusR: r, arusS: s, arusT: t);
  SwitchingLokal denganFoto(String slot, FotoP0 f) => _salin(foto: {...foto, slot: f});

  /// Jawaban server. `arusDikirim` = arus yang dikirim (data) atau null (jawaban upload foto).
  SwitchingLokal denganServer(Map<String, dynamic> d, {List<double>? arusDikirim}) {
    final server = ((d['fotoServer'] as List?) ?? const []).map((e) => '$e').toSet();
    return _salin(
      foto: {for (final e in foto.entries) e.key: server.contains(e.key) ? e.value.dikirim() : e.value},
      kodeResmi: '${d['kodeSwitching'] ?? kodeResmi}',
      arusTerkirim: arusDikirim,
    );
  }

  Map<String, dynamic> keJson() => {
        'id': id,
        'no': no,
        'sectionId': sectionId,
        'section': section,
        'indikator': indikator,
        'arusR': arusR,
        'arusS': arusS,
        'arusT': arusT,
        'catatan': catatan,
        'dibuat': dibuat.toUtc().toIso8601String(),
        'foto': {for (final e in foto.entries) e.key: e.value.keJson()},
        'kodeResmi': kodeResmi,
        if (arusTerkirim != null) 'arusTerkirim': arusTerkirim,
        if (!disimpan) 'disimpan': false,
        if (isianDraf.isNotEmpty) 'isianDraf': isianDraf,
      };

  static SwitchingLokal dariJson(Map<String, dynamic> j) => SwitchingLokal(
        id: '${j['id']}',
        no: (j['no'] as num?)?.toInt() ?? 0,
        sectionId: '${j['sectionId'] ?? ''}',
        section: '${j['section'] ?? ''}',
        indikator: {
          for (final e in ((j['indikator'] as Map<dynamic, dynamic>?) ?? const <dynamic, dynamic>{}).entries) '${e.key}': '${e.value}',
        },
        arusR: (j['arusR'] as num?)?.toDouble() ?? 0,
        arusS: (j['arusS'] as num?)?.toDouble() ?? 0,
        arusT: (j['arusT'] as num?)?.toDouble() ?? 0,
        catatan: '${j['catatan'] ?? ''}',
        dibuat: DateTime.parse(j['dibuat'] as String),
        foto: {
          for (final e in ((j['foto'] as Map<dynamic, dynamic>?) ?? const <dynamic, dynamic>{}).entries)
            if (e.value is Map<dynamic, dynamic>) '${e.key}': FotoP0.dariJson(Map<String, dynamic>.from(e.value as Map<dynamic, dynamic>)),
        },
        kodeResmi: '${j['kodeResmi'] ?? ''}',
        arusTerkirim: (j['arusTerkirim'] as List?)?.map((e) => (e as num).toDouble()).toList(),
        disimpan: j['disimpan'] != false,
        isianDraf: {
          for (final e in ((j['isianDraf'] as Map<dynamic, dynamic>?) ?? const <dynamic, dynamic>{}).entries) '${e.key}': '${e.value}',
        },
      );
}

// ---------------- v0.74.0: Pengecekan Gardu (anak P0) ----------------
const String pekerjaanGardu = 'Pengecekan Gardu';

/// Satu nilai ukur gardu: kunci kiriman server, label (juga label slot foto + watermark), satuan, slot foto.
typedef NilaiUkurGardu = ({String kunci, String label, String satuan, String slot, bool beban});

const List<NilaiUkurGardu> nilaiGardu = [
  (kunci: 'bebanR', label: 'Beban R', satuan: 'A', slot: 'BEBAN_R', beban: true),
  (kunci: 'bebanS', label: 'Beban S', satuan: 'A', slot: 'BEBAN_S', beban: true),
  (kunci: 'bebanT', label: 'Beban T', satuan: 'A', slot: 'BEBAN_T', beban: true),
  (kunci: 'bebanN', label: 'Beban N', satuan: 'A', slot: 'BEBAN_N', beban: true),
  (kunci: 'teganganRS', label: 'Tegangan R-S', satuan: 'V', slot: 'TEGANGAN_RS', beban: false),
  (kunci: 'teganganRT', label: 'Tegangan R-T', satuan: 'V', slot: 'TEGANGAN_RT', beban: false),
  (kunci: 'teganganST', label: 'Tegangan S-T', satuan: 'V', slot: 'TEGANGAN_ST', beban: false),
  (kunci: 'teganganRN', label: 'Tegangan R-N', satuan: 'V', slot: 'TEGANGAN_RN', beban: false),
  (kunci: 'teganganSN', label: 'Tegangan S-N', satuan: 'V', slot: 'TEGANGAN_SN', beban: false),
  (kunci: 'teganganTN', label: 'Tegangan T-N', satuan: 'V', slot: 'TEGANGAN_TN', beban: false),
];
const String slotKondisiGardu = 'KONDISI';
const double bebanGarduMaks = 3000; // ampere, sama dengan YAN_BEBAN_MAKS_ server
const double teganganGarduMaks = 1000; // volt, sama dengan YAN_TEGANGAN_MAKS_ server
final List<String> slotGarduWajib = [for (final n in nilaiGardu) n.slot];
final List<String> slotGardu = [...slotGarduWajib, slotKondisiGardu];
final Map<String, String> labelSlotGardu = {for (final n in nilaiGardu) n.slot: n.label, slotKondisiGardu: 'Kondisi / Temuan'};

/// P0 ini Pengecekan Gardu (huruf besar / kecil bebas), sama dengan p0Gardu_ server.
bool p0Gardu(String namaPekerjaan) => _kunciNama(namaPekerjaan) == _kunciNama(pekerjaanGardu);

/// Hasil ukur, rumus sama dengan hasilUkurGardu_ server (pratinjau di HP; angka resmi dari server).
/// kVA = (R x RN + S x SN + T x TN) / 1000, % = kVA / kapasitas x 100, ketidakseimbangan = (maks - rata2) / rata2 x 100.
/// v0.75.1: Arus Maks per Fasa = arus nominal trafo kVA x 1000 / (akar 3 x 400 V); [bebanMaks] = beban fasa tertinggi terukur.
({double? arusMaks, double bebanMaks, double kva, double? persen, double tidakSeimbang}) hasilUkurGardu(
    Map<String, double> n, double? kapasitas) {
  double v(String k) => n[k] ?? 0;
  final r = v('bebanR'), s = v('bebanS'), t = v('bebanT');
  final maks = math.max(r, math.max(s, t)), rata = (r + s + t) / 3;
  final kva = (r * v('teganganRN') + s * v('teganganSN') + t * v('teganganTN')) / 1000;
  double b2(double x) => (x * 100).roundToDouble() / 100;
  return (
    arusMaks: kapasitas != null && kapasitas > 0 ? b2(kapasitas * 1000 / (math.sqrt(3) * 400)) : null,
    bebanMaks: b2(maks),
    kva: b2(kva),
    persen: kapasitas != null && kapasitas > 0 ? b2(kva / kapasitas * 100) : null,
    tidakSeimbang: rata > 0 ? b2((maks - rata) / rata * 100) : 0,
  );
}

/// Waktu Beban dari jam WIB: WBP 17:00 - 21:59, selain itu LWBP (sama dengan waktuBebanGardu_ server).
String waktuBebanGardu(DateTime t) {
  final jam = t.toUtc().add(const Duration(hours: 7)).hour;
  return jam >= 17 && jam < 22 ? 'WBP' : 'LWBP';
}

/// Satu pengukuran gardu di HP (di dalam JSON P0 induk), SATU per P0.
/// Gardu terkunci sesudah disimpan; angka + catatan boleh dikoreksi sampai P0 selesai. Foto per nilai (10 wajib, kamera
/// SiSi, Beban R dulu) + Kondisi / Temuan (opsional); foto langsung terkunci dari review kamera.
class GarduUkurLokal {
  const GarduUkurLokal({
    required this.id,
    required this.garduId,
    required this.noGardu,
    this.alamat = '',
    this.section = '',
    this.kapasitas,
    this.garduLat,
    this.garduLng,
    required this.nilai,
    this.catatan = '',
    required this.dibuat,
    this.foto = const {},
    this.kodeResmi = '',
    this.terkirim,
    this.server = const {},
    this.disimpan = true,
  });

  final String id;
  final String garduId;
  final String noGardu;
  final String alamat;
  final String section;
  final double? kapasitas;
  final double? garduLat;
  final double? garduLng;
  final Map<String, double> nilai; // kunci nilaiGardu -> angka
  final String catatan;
  final DateTime dibuat;
  final Map<String, FotoP0> foto;
  final String kodeResmi; // <Kode P0>-GRD.nnn dari server

  /// Nilai + catatan terakhir yang diterima server. null = data belum terkirim.
  final Map<String, Object>? terkirim;

  /// Hasil terakhir dari server (hasil, diterapkan) untuk tampilan.
  final Map<String, Object?> server;

  /// v0.75.0: false = draf (foto sudah diambil, angka belum disimpan, belum dikirim). Simpan Pengukuran menyimpan
  /// angka + 10 foto wajib bersamaan.
  final bool disimpan;

  bool get lengkapFotoWajib => slotGarduWajib.every((s) => foto[s]?.terkunci ?? false);
  int get jumlahFotoWajib => slotGarduWajib.where((s) => foto[s]?.terkunci ?? false).length;
  bool get adaFotoBebanR => foto['BEBAN_R']?.terkunci ?? false;

  ({double? arusMaks, double bebanMaks, double kva, double? persen, double tidakSeimbang}) get hasil => hasilUkurGardu(nilai, kapasitas);

  /// Jarak titik foto Beban R ke koordinat gardu di master (m). null = salah satu tanpa titik.
  int? get jarakM {
    final f = foto['BEBAN_R'];
    if (f?.lat == null || f?.lng == null || garduLat == null || garduLng == null) return null;
    return (jarakKmP0(f!.lat!, f.lng!, garduLat!, garduLng!) * 1000).round();
  }

  Map<String, Object> get _isiKirim => {...nilai, 'catatan': catatan};

  bool get perluKirimData {
    final t = terkirim;
    if (t == null) return true;
    final isi = _isiKirim;
    return isi.length != t.length || isi.entries.any((e) => t[e.key] != e.value);
  }

  bool get perluKirim =>
      disimpan && (perluKirimData || slotGardu.any((s) => foto[s] != null && foto[s]!.terkunci && !foto[s]!.terkirim));

  String kodeTampil(P0Lokal induk) =>
      kodeResmi.isNotEmpty ? kodeResmi : '${induk.kodeWatermark} GRD #001';

  /// v0.75.0: semua foto langsung bisa diambil (urutan bebas, tanpa menunggu Simpan); yang sudah ada tidak bisa diulang.
  /// Jam Ukur + koordinat tetap dari foto Beban R (server menerima Beban R lebih dulu saat kirim).
  bool bolehFoto(String slot) => slotGardu.contains(slot) && foto[slot] == null;

  String? alasanBelumBoleh(String slot) {
    if (foto[slot] != null) return 'Foto ${labelSlotGardu[slot]} sudah disimpan, tidak bisa diambil ulang.';
    return null;
  }

  /// Draf: isian angka (yang sudah valid) + catatan disimpan sementara.
  GarduUkurLokal denganDraf(Map<String, double> n, String c) => _salin(nilai: Map.of(n), catatan: c);

  /// Draf jadi pengukuran tersimpan (Simpan Pengukuran).
  GarduUkurLokal disimpanDari(Map<String, double> n, String c, DateTime dibuat) =>
      _salin(nilai: Map.of(n), catatan: c, disimpan: true, dibuat: dibuat);

  GarduUkurLokal _salin({Map<String, double>? nilai, String? catatan, Map<String, FotoP0>? foto, String? kodeResmi,
          Map<String, Object>? terkirim, Map<String, Object?>? server, bool? disimpan, DateTime? dibuat}) =>
      GarduUkurLokal(
        id: id,
        garduId: garduId,
        noGardu: noGardu,
        alamat: alamat,
        section: section,
        kapasitas: kapasitas,
        garduLat: garduLat,
        garduLng: garduLng,
        nilai: nilai ?? this.nilai,
        catatan: catatan ?? this.catatan,
        dibuat: dibuat ?? this.dibuat,
        foto: foto ?? this.foto,
        kodeResmi: kodeResmi ?? this.kodeResmi,
        terkirim: terkirim ?? this.terkirim,
        server: server ?? this.server,
        disimpan: disimpan ?? this.disimpan,
      );

  GarduUkurLokal denganNilai(Map<String, double> n, String c) => _salin(nilai: Map.of(n), catatan: c);
  GarduUkurLokal denganFoto(String slot, FotoP0 f) => _salin(foto: {...foto, slot: f});

  /// Jawaban server. `dikirim` = isi data yang dikirim (simpan) atau null (jawaban upload foto).
  GarduUkurLokal denganServer(Map<String, dynamic> d, {Map<String, Object>? dikirim}) {
    final fs = ((d['fotoServer'] as List?) ?? const []).map((e) => '$e').toSet();
    final h = d['hasil'];
    return _salin(
      foto: {for (final e in foto.entries) e.key: fs.contains(e.key) ? e.value.dikirim() : e.value},
      kodeResmi: '${d['kodeUkur'] ?? kodeResmi}',
      terkirim: dikirim,
      server: {if (h is Map<dynamic, dynamic>) ...Map<String, Object?>.from(h), 'diterapkan': '${d['diterapkan'] ?? ''}'},
    );
  }

  /// Isi kiriman simpanGarduYandal (tanpa id / waktu).
  Map<String, Object> get isiKirim => _isiKirim;

  Map<String, dynamic> keJson() => {
        'id': id,
        'garduId': garduId,
        'noGardu': noGardu,
        'alamat': alamat,
        'section': section,
        if (kapasitas != null) 'kapasitas': kapasitas,
        if (garduLat != null) 'garduLat': garduLat,
        if (garduLng != null) 'garduLng': garduLng,
        'nilai': nilai,
        'catatan': catatan,
        'dibuat': dibuat.toUtc().toIso8601String(),
        'foto': {for (final e in foto.entries) e.key: e.value.keJson()},
        'kodeResmi': kodeResmi,
        if (terkirim != null) 'terkirim': terkirim,
        if (server.isNotEmpty) 'server': server,
        if (!disimpan) 'disimpan': false,
      };

  static GarduUkurLokal dariJson(Map<String, dynamic> j) {
    Map<String, dynamic> peta(Object? v) => v is Map<dynamic, dynamic> ? Map<String, dynamic>.from(v) : <String, dynamic>{};
    final t = j['terkirim'];
    return GarduUkurLokal(
      id: '${j['id']}',
      garduId: '${j['garduId'] ?? ''}',
      noGardu: '${j['noGardu'] ?? ''}',
      alamat: '${j['alamat'] ?? ''}',
      section: '${j['section'] ?? ''}',
      kapasitas: (j['kapasitas'] as num?)?.toDouble(),
      garduLat: (j['garduLat'] as num?)?.toDouble(),
      garduLng: (j['garduLng'] as num?)?.toDouble(),
      nilai: {for (final e in peta(j['nilai']).entries) if (e.value is num) e.key: (e.value as num).toDouble()},
      catatan: '${j['catatan'] ?? ''}',
      dibuat: DateTime.parse(j['dibuat'] as String),
      foto: {
        for (final e in peta(j['foto']).entries)
          if (e.value is Map<dynamic, dynamic>) e.key: FotoP0.dariJson(Map<String, dynamic>.from(e.value as Map<dynamic, dynamic>)),
      },
      kodeResmi: '${j['kodeResmi'] ?? ''}',
      terkirim: t is Map<dynamic, dynamic>
          ? {
              for (final e in Map<String, dynamic>.from(t).entries)
                if (e.value is num) e.key: (e.value as num).toDouble() else if (e.value != null) e.key: '${e.value}',
            }
          : null,
      server: peta(j['server']),
      disimpan: j['disimpan'] != false,
    );
  }
}

/// v0.75.0: aturan "Pengukuran Gardu 2 Hari Sekali". [tglUkur] = ukur terakhir, [tglP0] = tanggal P0 (yyyy-MM-dd).
/// Hasil: tanggal paling cepat boleh diukur lagi kalau masih di dalam jeda, null = boleh.
String? bisaUkurLagi(String tglUkur, String tglP0, {int jedaHari = 2}) {
  final a = DateTime.tryParse(tglUkur.length >= 10 ? tglUkur.substring(0, 10) : ''), b = DateTime.tryParse(tglP0);
  if (a == null || b == null) return null;
  final selisih = DateTime.utc(b.year, b.month, b.day).difference(DateTime.utc(a.year, a.month, a.day)).inDays;
  if (selisih >= jedaHari) return null;
  return DateTime.utc(a.year, a.month, a.day).add(Duration(days: jedaHari)).toIso8601String().substring(0, 10);
}

/// "80" / "47,5" (angka ukur gardu).
String teksUkur(double a) => teksArus(a);

/// "45" / "47,5" (arus ampere).
String teksArus(double a) => a == a.roundToDouble() ? a.toStringAsFixed(0) : a.toString().replaceAll('.', ',');

class FotoP0 {
  const FotoP0({
    required this.path,
    required this.waktu,
    required this.sumber,
    this.lat,
    this.lng,
    this.akurasiM,
    DateTime? waktuHp,
    this.sumberWaktu = 'HP',
    this.terkunci = false,
    this.terkirim = false,
    this.gpsSusulanDetik,
  }) : waktuHp = waktuHp ?? waktu;

  final String path;
  final DateTime waktu; // v0.64.2: jam terpercaya (jam server + monoton); tanpa patokan = jam HP
  final String sumber; // KAMERA | GALERI
  final DateTime waktuHp; // jam dinding HP saat itu (pembanding)
  final String sumberWaktu; // SERVER | HP
  final double? lat;
  final double? lng;
  final double? akurasiM;

  /// v0.64.7: foto sudah disimpan (diverifikasi petugas). Belum = masih boleh diambil ulang. Data lama (tanpa kunci) = true.
  final bool terkunci;

  /// v0.65.0: foto sudah diterima server (uploadFotoP0Yandal).
  final bool terkirim;

  /// v0.65.2: koordinat menyusul N detik sesudah jepret (maks 30). null = fix saat jepret / tanpa GPS.
  final int? gpsSusulanDetik;

  FotoP0 _salin({bool? terkunci, bool? terkirim}) => FotoP0(
      path: path,
      waktu: waktu,
      sumber: sumber,
      lat: lat,
      lng: lng,
      akurasiM: akurasiM,
      waktuHp: waktuHp,
      sumberWaktu: sumberWaktu,
      terkunci: terkunci ?? this.terkunci,
      terkirim: terkirim ?? this.terkirim,
      gpsSusulanDetik: gpsSusulanDetik);

  FotoP0 dikunci() => _salin(terkunci: true);
  FotoP0 dikirim() => _salin(terkunci: true, terkirim: true);

  /// "lat,lng" 6 desimal (sama dengan kolom Koordinat yan_P0). null = tanpa GPS.
  String? get koordinat => lat == null || lng == null ? null : '${lat!.toStringAsFixed(6)},${lng!.toStringAsFixed(6)}';

  Map<String, dynamic> keJson() => {
        'path': path,
        'waktu': waktu.toUtc().toIso8601String(),
        'sumber': sumber,
        'waktuHp': waktuHp.toUtc().toIso8601String(),
        'sumberWaktu': sumberWaktu,
        if (lat != null) 'lat': lat,
        if (lng != null) 'lng': lng,
        if (akurasiM != null) 'akurasiM': akurasiM,
        'terkunci': terkunci,
        'terkirim': terkirim,
        if (gpsSusulanDetik != null) 'gpsSusulanDetik': gpsSusulanDetik,
      };

  static FotoP0 dariJson(Map<String, dynamic> j) => FotoP0(
        path: '${j['path'] ?? ''}',
        waktu: DateTime.parse(j['waktu'] as String),
        sumber: '${j['sumber'] ?? 'KAMERA'}',
        lat: (j['lat'] as num?)?.toDouble(),
        lng: (j['lng'] as num?)?.toDouble(),
        akurasiM: (j['akurasiM'] as num?)?.toDouble(),
        waktuHp: DateTime.tryParse('${j['waktuHp'] ?? ''}'),
        sumberWaktu: '${j['sumberWaktu'] ?? 'HP'}',
        terkunci: j['terkunci'] != false, // v0.64.7: foto sebelum ada tombol Simpan dianggap sudah disimpan
        terkirim: j['terkirim'] == true,
        gpsSusulanDetik: (j['gpsSusulanDetik'] as num?)?.toInt(),
      );
}

class P0Lokal {
  const P0Lokal({
    required this.id,
    required this.userId,
    required this.shiftId,
    required this.kodeShift,
    required this.no,
    required this.namaPekerjaan,
    this.pekerjaanLainnya = '',
    this.penyulang = '',
    this.section = '',
    this.sectionId = '',
    this.daerah = '',
    this.catatan = '',
    required this.dibuat,
    this.foto = const {},
    this.sinkron = 'LOKAL',
    DateTime? dibuatHp,
    this.sumberWaktu = 'HP',
    this.kodeResmi = '',
    this.finalTerkirim = false,
    this.statusApproval = '',
    this.alasanRejected = '',
    this.errorKirim = '',
    this.switching = const [],
    this.lokasiBelumTerkirim = false,
    this.lokasiDiubah,
    this.ukurGardu,
  }) : dibuatHp = dibuatHp ?? dibuat;

  final String id;
  final String userId;
  final String shiftId;
  final String kodeShift;
  final int no; // urutan P0 di shift ini (HP). Kode resmi dari server saat sync.
  final String namaPekerjaan;
  final String pekerjaanLainnya;
  final String penyulang;
  final String section;
  final String sectionId;
  final String daerah;
  final String catatan;
  final DateTime dibuat;
  final Map<String, FotoP0> foto;
  final String sinkron;
  final DateTime dibuatHp; // v0.64.2: jam HP saat P0 dibuat (dibuat = jam terpercaya)
  final String sumberWaktu; // SERVER | HP (sumber waktu `dibuat`)

  /// v0.65.0: dari server. kodeResmi = `<Kode Shift>-P0.nnn` (kosong = belum terkirim).
  final String kodeResmi;

  /// P0 sudah dikirim dengan tanda final (akhir shift): server memutuskan Rejected "P0 Tidak Selesai" bila tanpa Sesudah.
  final bool finalTerkirim;
  final String statusApproval; // '' | Menunggu | Approved | Rejected (terakhir diketahui dari server)
  final String alasanRejected;

  /// Kode error terakhir yang bukan gangguan sinyal (data ditolak server). Tidak dikirim ulang otomatis.
  final String errorKirim;

  /// v0.66.0: Pengecekan Switching (urut no).
  final List<SwitchingLokal> switching;

  /// v0.66.4: penyulang / section / daerah diubah sesudah P0 terkirim, perubahan belum diterima server.
  final bool lokasiBelumTerkirim;

  /// v0.66.5: jam terpercaya saat lokasi terakhir diedit (dicek server: di jam shift, sesudah P0 dibuat).
  final DateTime? lokasiDiubah;

  /// v0.74.0: Pengecekan Gardu (satu per P0). null = belum ada.
  final GarduUkurLokal? ukurGardu;

  bool get butuhGardu => p0Gardu(namaPekerjaan);

  /// Pengukuran gardu boleh dibuat: Pengecekan Gardu, foto Sebelum disimpan, P0 belum selesai, belum ada pengukuran.
  bool get bolehTambahGardu =>
      butuhGardu && (foto['SEBELUM']?.terkunci ?? false) && !selesai && !(ukurGardu?.disimpan ?? false);

  /// Syarat foto Sesudah P0 Pengecekan Gardu: pengukuran dengan 10 foto wajib lengkap.
  bool get ukurGarduLengkap => (ukurGardu?.disimpan ?? false) && (ukurGardu?.lengkapFotoWajib ?? false);

  P0Lokal denganUkurGardu(GarduUkurLokal? g) => _salin(foto: foto, ukurGardu: g, hapusUkurGardu: g == null);

  P0Lokal ubahUkurGardu(GarduUkurLokal Function(GarduUkurLokal g) ubah) {
    final g = ukurGardu;
    return g == null ? this : denganUkurGardu(ubah(g));
  }

  /// v0.66.4: Nama Switching P0 Pengecekan Switching = depan nama section P0 ('' kalau section bukan LBS / ACR).
  String get namaSwitchingP0 {
    final n = namaSwitching(section);
    return sectionId.isNotEmpty && switchingSah(n) ? n : '';
  }

  /// v0.66.4: lokasi (penyulang / section / daerah) boleh diedit: P0 belum selesai, belum ada approval, dan untuk
  /// Pengecekan Switching hanya sebelum switching disimpan (Nama Switching terkunci sesudah itu).
  bool get bolehUbahLokasi => !selesai && statusApproval.isEmpty && !(butuhSwitching && switching.isNotEmpty);

  /// Alasan lokasi tidak bisa diedit (null = boleh). v0.75.0: draf foto switching juga mengunci (watermark section).
  String? get alasanTidakUbahLokasi => bolehUbahLokasi
      ? null
      : selesai || statusApproval.isNotEmpty
          ? 'P0 sudah selesai, lokasi tidak bisa diubah.'
          : switching.every((w) => !w.disimpan)
              ? 'Sudah ada foto switching. Hapus foto draf dulu untuk mengubah section.'
              : 'Data switching sudah disimpan, section tidak bisa diubah lagi.';

  /// v0.66.4: salinan dengan lokasi baru. Sudah terkirim = ditandai untuk dikirim ulang (ubahLokasi).
  P0Lokal denganLokasi(
          {required String penyulang, required String section, required String sectionId, required String daerah, DateTime? diubah}) =>
      P0Lokal(
        id: id,
        userId: userId,
        shiftId: shiftId,
        kodeShift: kodeShift,
        no: no,
        namaPekerjaan: namaPekerjaan,
        pekerjaanLainnya: pekerjaanLainnya,
        penyulang: penyulang,
        section: section,
        sectionId: sectionId,
        daerah: daerah,
        catatan: catatan,
        dibuat: dibuat,
        foto: foto,
        sinkron: sinkron,
        dibuatHp: dibuatHp,
        sumberWaktu: sumberWaktu,
        kodeResmi: kodeResmi,
        finalTerkirim: finalTerkirim,
        statusApproval: statusApproval,
        alasanRejected: alasanRejected,
        errorKirim: errorKirim,
        switching: switching,
        lokasiBelumTerkirim: lokasiBelumTerkirim || terkirim,
        lokasiDiubah: diubah ?? lokasiDiubah,
        ukurGardu: ukurGardu,
      );

  bool get butuhSwitching => p0Switching(namaPekerjaan);

  /// Ada switching yang foto arusnya sudah disimpan (syarat foto Sesudah P0 Pengecekan Switching).
  bool get adaSwitchingArus => switching.any((w) => w.disimpan && w.adaFotoArus);

  /// Switching boleh ditambah: Pengecekan Switching, foto Sebelum sudah disimpan, P0 belum selesai,
  /// v0.66.3: belum ada switching (SATU switching per P0, keputusan kvlar 9 Okt 2026).
  bool get bolehTambahSwitching =>
      butuhSwitching && (foto['SEBELUM']?.terkunci ?? false) && !selesai && switching.every((w) => !w.disimpan);

  SwitchingLokal? switchingId(String id) {
    for (final w in switching) {
      if (w.id == id) return w;
    }
    return null;
  }

  P0Lokal denganSwitching(List<SwitchingLokal> l) => _salin(foto: foto, switching: l);

  /// Ganti satu switching (id sama). Tidak ada = tidak berubah.
  P0Lokal ubahSwitching(String id, SwitchingLokal Function(SwitchingLokal w) ubah) =>
      denganSwitching([for (final w in switching) w.id == id ? ubah(w) : w]);

  /// Data P0 (bukan foto) sudah diterima server.
  bool get terkirim => sinkron == 'TERKIRIM';

  /// Ada yang masih perlu dikirim: data P0, foto yang sudah disimpan, atau (akhir shift) tanda final.
  bool perluKirim({required bool akhirShift}) =>
      errorKirim.isEmpty &&
      (!terkirim ||
          lokasiBelumTerkirim ||
          slotP0.any((s) => foto[s] != null && (foto[s]!.terkunci || akhirShift) && !foto[s]!.terkirim) ||
          switching.any((w) => w.perluKirim) ||
          (ukurGardu?.perluKirim ?? false) ||
          (akhirShift && !finalTerkirim));

  /// Slot yang sudah disimpan, berurutan (dikirim ke server sebagai slotHp).
  List<String> get slotDisimpan {
    final l = <String>[];
    for (final s in slotP0) {
      if (foto[s]?.terkunci != true) break;
      l.add(s);
    }
    return l;
  }

  /// Ada waktu (dibuat / foto) yang belum tervalidasi jam server (HP restart lalu offline).
  bool get adaWaktuHp => sumberWaktu != 'SERVER' || foto.values.any((f) => f.sumberWaktu != 'SERVER');

  /// v0.64.7: selesai = foto Sesudah sudah DISIMPAN (diverifikasi), bukan sekadar diambil.
  bool get selesai => foto['SESUDAH']?.terkunci ?? false;
  String get status => selesai ? 'SELESAI' : 'PROSES';

  /// Slot yang fotonya sudah diambil tapi belum disimpan (urut slot).
  List<String> get belumDisimpan => [for (final s in slotP0) if (foto[s] != null && !foto[s]!.terkunci) s];

  /// Label tahap untuk kartu (sama dengan v1) + v0.64.7 penanda foto belum disimpan.
  String get tahap => selesai
      ? 'P0 selesai'
      : belumDisimpan.isNotEmpty
          ? 'Simpan foto ${labelSlotP0[belumDisimpan.last]}'
          : foto.containsKey('PEKERJAAN')
              ? 'Proses pekerjaan'
              : foto.containsKey('SEBELUM')
                  ? 'Memulai pekerjaan'
                  : 'Belum mulai';

  /// Nama untuk tampilan: "Lain - Lain" diganti isian Pekerjaan Lainnya.
  String get namaTampil => namaPekerjaan == pekerjaanLainLain && pekerjaanLainnya.isNotEmpty ? pekerjaanLainnya : namaPekerjaan;

  String get kodeTampil => kodeResmi.isNotEmpty ? kodeResmi : 'P0 #${no.toString().padLeft(3, '0')}';

  /// Kode di watermark: kode resmi, atau kode shift + nomor HP kalau belum terkirim.
  String get kodeWatermark => kodeResmi.isNotEmpty ? kodeResmi : '${kodeShift.isEmpty ? '' : '$kodeShift '}P0 #${no.toString().padLeft(3, '0')}';

  /// Durasi = foto Sebelum s.d. foto Sesudah. Belum selesai = null.
  Duration? get durasi {
    final a = foto['SEBELUM']?.waktu, b = foto['SESUDAH']?.waktu;
    if (a == null || b == null || !b.isAfter(a)) return null;
    return b.difference(a);
  }

  /// Slot boleh diisi kalau foto slot sebelumnya sudah ada DAN sudah disimpan (urut Sebelum > Pekerjaan > Sesudah).
  /// v0.64.7: slot yang sudah ada fotonya hanya boleh diambil ulang selama belum disimpan.
  bool bolehFoto(String slot) {
    final i = slotP0.indexOf(slot);
    if (i < 0) return false;
    final ada = foto[slot];
    if (ada != null) return !ada.terkunci;
    if (slot == 'SESUDAH' && butuhSwitching && !adaSwitchingArus) return false; // v0.66.0
    if (slot == 'SESUDAH' && butuhGardu && !ukurGarduLengkap) return false; // v0.74.0
    return i == 0 || (foto[slotP0[i - 1]]?.terkunci ?? false);
  }

  /// Alasan slot kosong belum boleh difoto (null = boleh / sudah ada foto).
  String? alasanBelumBoleh(String slot) {
    final i = slotP0.indexOf(slot);
    if (i <= 0 || foto[slot] != null || bolehFoto(slot)) return null;
    final sbl = slotP0[i - 1];
    if (foto[sbl] == null) return 'Ambil foto ${labelSlotP0[sbl]} dulu.';
    if (!(foto[sbl]?.terkunci ?? false)) return 'Simpan foto ${labelSlotP0[sbl]} dulu.';
    if (slot == 'SESUDAH' && butuhSwitching && !adaSwitchingArus) return 'Simpan data switching dan Foto Arus dulu.';
    if (slot == 'SESUDAH' && butuhGardu && !ukurGarduLengkap) {
      final g = ukurGardu;
      return g == null || !g.disimpan
          ? 'Simpan pengukuran gardu dulu.'
          : 'Lengkapi foto ukur gardu dulu (${g.jumlahFotoWajib} dari ${slotGarduWajib.length}).';
    }
    return null;
  }

  /// v0.64.5 -> v0.64.7: ambil ulang hanya untuk foto yang BELUM disimpan. Tahap berikutnya baru bisa difoto setelah
  /// foto ini disimpan, jadi Waktu Sebelum <= Pekerjaan <= Sesudah tetap urut. Slot kosong = false (itu ambil pertama).
  bool bolehAmbilUlang(String slot) {
    final f = slotP0.contains(slot) ? foto[slot] : null;
    return f != null && !f.terkunci;
  }

  /// Alasan ambil ulang ditolak (null = boleh / slot kosong).
  String? alasanTidakUlang(String slot) {
    final f = slotP0.contains(slot) ? foto[slot] : null;
    if (f == null || !f.terkunci) return null;
    return 'Foto ${labelSlotP0[slot]} sudah disimpan, tidak bisa diambil ulang.';
  }

  /// Semua foto yang ada dikunci (tombol Simpan Foto).
  P0Lokal denganFotoDikunci() => _salin(foto: {for (final e in foto.entries) e.key: e.value.dikunci()});

  /// v0.65.2: slot sumber titik pekerjaan: foto Sebelum ber-GPS, cadangan foto Pekerjaan (titik kerja sama).
  /// Foto Sesudah tidak dipakai (itu titik closing). null = belum ada titik. Sama dengan server (foto_meta.sumberKoordinat).
  String? get slotTitikPekerjaan {
    for (final s in const ['SEBELUM', 'PEKERJAAN']) {
      if (foto[s]?.koordinat != null) return s;
    }
    return null;
  }

  FotoP0? get fotoTitikPekerjaan {
    final s = slotTitikPekerjaan;
    return s == null ? null : foto[s];
  }

  /// Jarak garis lurus titik pekerjaan ke titik closing (foto Sesudah), km. null = GPS belum lengkap.
  double? get jarakKm {
    final a = fotoTitikPekerjaan, b = foto['SESUDAH'];
    if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return null;
    return jarakKmP0(a!.lat!, a.lng!, b!.lat!, b.lng!);
  }

  /// Lokasi singkat: penyulang · section · daerah (yang terisi).
  String get lokasi => [penyulang, section, daerah].where((v) => v.trim().isNotEmpty).join(' · ');

  P0Lokal denganFoto(String slot, FotoP0 f) => _salin(foto: {...foto, slot: f});

  /// v0.65.0: salinan dengan data dari server (jawaban simpanP0Yandal / uploadFotoP0Yandal).
  P0Lokal denganServer(Map<String, dynamic> d, {bool? finalTerkirim}) {
    final server = ((d['fotoServer'] as List?) ?? const []).map((e) => '$e').toSet();
    return _salin(
      foto: {for (final e in foto.entries) e.key: server.contains(e.key) ? e.value.dikirim() : e.value},
      sinkron: 'TERKIRIM',
      kodeResmi: '${d['kodeP0'] ?? kodeResmi}',
      statusApproval: '${d['statusApproval'] ?? statusApproval}',
      alasanRejected: '${d['alasanRejected'] ?? alasanRejected}',
      finalTerkirim: finalTerkirim ?? this.finalTerkirim,
      errorKirim: '',
      lokasiBelumTerkirim: false,
    );
  }

  P0Lokal denganError(String kode) => _salin(foto: foto, errorKirim: kode);

  /// v0.66.4: lokasi sama dengan [lain] (penyulang / section / daerah).
  bool lokasiSama(P0Lokal lain) => penyulang == lain.penyulang && sectionId == lain.sectionId && daerah == lain.daerah;

  /// v0.66.4: jawaban server untuk data yang dikirim ([dikirim]); lokasi diedit lagi selama kirim = tetap tertunda.
  P0Lokal denganServerData(Map<String, dynamic> d, P0Lokal dikirim) {
    final b = denganServer(d);
    return lokasiSama(dikirim) ? b : b._salin(foto: b.foto, lokasiBelumTerkirim: true);
  }

  P0Lokal _salin(
          {required Map<String, FotoP0> foto,
          List<SwitchingLokal>? switching,
          String? sinkron,
          String? kodeResmi,
          String? statusApproval,
          String? alasanRejected,
          bool? finalTerkirim,
          String? errorKirim,
          bool? lokasiBelumTerkirim,
          GarduUkurLokal? ukurGardu,
          bool hapusUkurGardu = false}) =>
      P0Lokal(
        id: id,
        userId: userId,
        shiftId: shiftId,
        kodeShift: kodeShift,
        no: no,
        namaPekerjaan: namaPekerjaan,
        pekerjaanLainnya: pekerjaanLainnya,
        penyulang: penyulang,
        section: section,
        sectionId: sectionId,
        daerah: daerah,
        catatan: catatan,
        dibuat: dibuat,
        foto: foto,
        sinkron: sinkron ?? this.sinkron,
        dibuatHp: dibuatHp,
        sumberWaktu: sumberWaktu,
        kodeResmi: kodeResmi ?? this.kodeResmi,
        finalTerkirim: finalTerkirim ?? this.finalTerkirim,
        statusApproval: statusApproval ?? this.statusApproval,
        alasanRejected: alasanRejected ?? this.alasanRejected,
        errorKirim: errorKirim ?? this.errorKirim,
        switching: switching ?? this.switching,
        lokasiBelumTerkirim: lokasiBelumTerkirim ?? this.lokasiBelumTerkirim,
        lokasiDiubah: lokasiDiubah,
        ukurGardu: hapusUkurGardu ? null : (ukurGardu ?? this.ukurGardu),
      );

  Map<String, dynamic> keJson() => {
        'id': id,
        'userId': userId,
        'shiftId': shiftId,
        'kodeShift': kodeShift,
        'no': no,
        'namaPekerjaan': namaPekerjaan,
        'pekerjaanLainnya': pekerjaanLainnya,
        'penyulang': penyulang,
        'section': section,
        'sectionId': sectionId,
        'daerah': daerah,
        'catatan': catatan,
        'dibuat': dibuat.toUtc().toIso8601String(),
        'foto': {for (final e in foto.entries) e.key: e.value.keJson()},
        'sinkron': sinkron,
        'dibuatHp': dibuatHp.toUtc().toIso8601String(),
        'sumberWaktu': sumberWaktu,
        'kodeResmi': kodeResmi,
        'finalTerkirim': finalTerkirim,
        'statusApproval': statusApproval,
        'alasanRejected': alasanRejected,
        'errorKirim': errorKirim,
        if (switching.isNotEmpty) 'switching': [for (final w in switching) w.keJson()],
        if (lokasiBelumTerkirim) 'lokasiBelumTerkirim': true,
        if (lokasiDiubah != null) 'lokasiDiubah': lokasiDiubah!.toUtc().toIso8601String(),
        if (ukurGardu != null) 'ukurGardu': ukurGardu!.keJson(),
      };

  static P0Lokal dariJson(Map<String, dynamic> j) => P0Lokal(
        id: j['id'] as String,
        userId: j['userId'] as String,
        shiftId: j['shiftId'] as String,
        kodeShift: '${j['kodeShift'] ?? ''}',
        no: (j['no'] as num?)?.toInt() ?? 0,
        namaPekerjaan: '${j['namaPekerjaan'] ?? ''}',
        pekerjaanLainnya: '${j['pekerjaanLainnya'] ?? ''}',
        penyulang: '${j['penyulang'] ?? ''}',
        section: '${j['section'] ?? ''}',
        sectionId: '${j['sectionId'] ?? ''}',
        daerah: '${j['daerah'] ?? ''}',
        catatan: '${j['catatan'] ?? ''}',
        dibuat: DateTime.parse(j['dibuat'] as String),
        foto: {
          for (final e in ((j['foto'] as Map<dynamic, dynamic>?) ?? const <dynamic, dynamic>{}).entries)
            if (e.value is Map<dynamic, dynamic>) '${e.key}': FotoP0.dariJson(Map<String, dynamic>.from(e.value as Map<dynamic, dynamic>)),
        },
        sinkron: '${j['sinkron'] ?? 'LOKAL'}',
        dibuatHp: DateTime.tryParse('${j['dibuatHp'] ?? ''}'),
        sumberWaktu: '${j['sumberWaktu'] ?? 'HP'}',
        kodeResmi: '${j['kodeResmi'] ?? ''}',
        finalTerkirim: j['finalTerkirim'] == true,
        statusApproval: '${j['statusApproval'] ?? ''}',
        alasanRejected: '${j['alasanRejected'] ?? ''}',
        errorKirim: '${j['errorKirim'] ?? ''}',
        switching: [
          for (final w in ((j['switching'] as List?) ?? const []))
            if (w is Map<dynamic, dynamic>) SwitchingLokal.dariJson(Map<String, dynamic>.from(w)),
        ]..sort((a, b) => a.no.compareTo(b.no)),
        lokasiBelumTerkirim: j['lokasiBelumTerkirim'] == true,
        lokasiDiubah: DateTime.tryParse('${j['lokasiDiubah'] ?? ''}'),
        ukurGardu: j['ukurGardu'] is Map<dynamic, dynamic>
            ? GarduUkurLokal.dariJson(Map<String, dynamic>.from(j['ukurGardu'] as Map<dynamic, dynamic>))
            : null,
      );
}

/// Kelompok per nama pekerjaan: P0 sedang dikerjakan + sudah dikerjakan. Urut: terbanyak dulu, lalu abjad.
class KelompokP0 {
  KelompokP0(this.nama);
  final String nama;
  final List<P0Lokal> proses = [];
  final List<P0Lokal> selesai = [];
  int get jumlah => proses.length + selesai.length;
}

List<KelompokP0> kelompokP0(List<P0Lokal> semua) {
  final peta = <String, KelompokP0>{};
  for (final p in semua) {
    final k = peta.putIfAbsent(p.namaTampil, () => KelompokP0(p.namaTampil));
    (p.selesai ? k.selesai : k.proses).add(p);
  }
  return peta.values.toList()..sort((a, b) => b.jumlah != a.jumlah ? b.jumlah - a.jumlah : a.nama.compareTo(b.nama));
}

/// Jam shift berjalan dari batas sesi (sesiSampai = hh:59 menit peralihan): mulai = sampai + 1 menit - 8 jam.
({DateTime mulai, DateTime akhir}) jadwalShiftDari(DateTime sesiSampai) {
  final akhir = sesiSampai.add(const Duration(minutes: 1));
  return (mulai: akhir.subtract(const Duration(hours: 8)), akhir: akhir);
}

/// Bagian shift yang sudah lewat (0..1) dan sisa waktunya.
({double lewat, Duration sisa}) kemajuanShift(DateTime sesiSampai, DateTime sekarang) {
  final j = jadwalShiftDari(sesiSampai);
  final total = j.akhir.difference(j.mulai).inSeconds;
  final lewat = sekarang.difference(j.mulai).inSeconds.clamp(0, total);
  final sisa = sesiSampai.difference(sekarang);
  return (lewat: total == 0 ? 1 : lewat / total, sisa: sisa.isNegative ? Duration.zero : sisa);
}

/// "3 j 05 mnt" / "12 mnt" / "45 dtk". v0.65.12: di bawah 1 menit = detik (dulu "0 m"); satuan "mnt" supaya tidak
/// tertukar dengan jarak meter ("5 m").
String teksDurasi(Duration d) {
  if (d.isNegative) d = Duration.zero;
  final j = d.inHours, m = d.inMinutes % 60;
  if (j == 0 && m == 0) return '${d.inSeconds} dtk';
  return j > 0 ? '$j j ${m.toString().padLeft(2, '0')} mnt' : '$m mnt';
}

/// v0.65.12: durasi dari server (menit, 2 desimal) ke teks [teksDurasi]. null / bukan angka = "-".
String teksMenit(Object? menit) {
  final n = menit is num ? menit : num.tryParse('${menit ?? ''}'.replaceAll(',', '.'));
  if (n == null) return '-';
  return teksDurasi(Duration(milliseconds: (n * 60000).round()));
}

/// Haversine (km), sama dengan jarakKm_ di server.
double jarakKmP0(double lat1, double lon1, double lat2, double lon2) {
  double rad(double d) => d * math.pi / 180;
  final dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  final a = math.pow(math.sin(dLat / 2), 2) + math.cos(rad(lat1)) * math.cos(rad(lat2)) * math.pow(math.sin(dLon / 2), 2);
  return 6371 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
}

/// "0,25 km" / "850 m".
String teksJarak(double km) => km < 1 ? '${(km * 1000).round()} m' : '${km.toStringAsFixed(2).replaceAll('.', ',')} km';

/// v0.64.8 (format kvlar 8 Okt 2026): teks WhatsApp satu P0 = FORMAT PENUGASAN KHUSUS. Kosong = "-".
/// Petugas: "A dan B", tiga orang atau lebih "A, B dan C".
String teksWaP0(P0Lokal x, {required List<String> petugas}) {
  String isi(String v) => v.trim().isEmpty ? '-' : v.trim();
  final p = petugas.map((e) => e.trim()).where((e) => e.isNotEmpty).toList();
  final teksPetugas = p.isEmpty ? '-' : p.length == 1 ? p.first : '${p.sublist(0, p.length - 1).join(', ')} dan ${p.last}';
  return [
    '*FORMAT PENUGASAN KHUSUS*',
    '',
    'Pekerjaan : ${isi(x.namaTampil)}',
    'Penyulang : ${isi(x.penyulang)}',
    'Section : ${isi(x.section)}',
    'Daerah : ${isi(x.daerah)}',
    'Petugas : $teksPetugas',
  ].join('\n');
}
