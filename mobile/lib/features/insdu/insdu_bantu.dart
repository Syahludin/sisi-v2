/// v1.0.11 (permintaan kvlar 21 Okt 2026): bantuan murni (tanpa Flutter) modul Inspeksi Gardu di HP:
/// master dropdown, label cover, hitung beban (sama dengan hasilUkurGardu_ server), status ukur, teks tunggakan.
library;

String teksInsDu(Object? v) => v?.toString().trim() ?? '';

List<Map<String, dynamic>> daftarInsDu(Object? v) =>
    v is List ? [for (final x in v) if (x is Map) Map<String, dynamic>.from(x)] : <Map<String, dynamic>>[];

Map<String, dynamic>? petaInsDu(Object? v) => v is Map ? Map<String, dynamic>.from(v) : null;

num? angkaInsDu(Object? v) => v is num ? v : num.tryParse(teksInsDu(v).replaceAll(',', '.'));

/// Satu gardu AKTIF db_Gardu (getMasterInsDu / getMasterTemuanInspeksi).
class GarduInsDu {
  GarduInsDu(Map<String, dynamic> m)
      : garduId = teksInsDu(m['garduId']),
        noGardu = teksInsDu(m['noGardu']),
        penyulang = teksInsDu(m['penyulang']),
        section = teksInsDu(m['section']),
        alamat = teksInsDu(m['alamat']),
        kapasitasKva = angkaInsDu(m['kapasitasKva']),
        merk = teksInsDu(m['merk']),
        nomorSeri = teksInsDu(m['nomorSeri']),
        tahun = teksInsDu(m['tahun']),
        merkPhb = teksInsDu(m['merkPhb']),
        seriPhb = teksInsDu(m['seriPhb']),
        tahunPhb = teksInsDu(m['tahunPhb']),
        koordinat = teksInsDu(m['koordinat']);

  final String garduId, noGardu, penyulang, section, alamat, merk;

  /// v1.0.14: data trafo / PHB-TR untuk teks WA dan koordinat awal temuan (Lat / Long db_Gardu).
  final String nomorSeri, tahun, merkPhb, seriPhb, tahunPhb, koordinat;
  final num? kapasitasKva;

  /// Teks pilihan dropdown: "TB0101 · Jl. Sangkar · 100 kVA".
  String get label => [
        noGardu,
        if (alamat.isNotEmpty) alamat,
        if (kapasitasKva != null) '${_angka(kapasitasKva!)} kVA',
      ].join(' · ');
}

/// Pilihan cover gardu (urutan sama dengan INSDU_COVER_ server).
const Map<String, String> labelCoverInsDu = {
  'coverFcoAtas': 'Cover FCO atas',
  'coverFcoBawah': 'Cover FCO bawah',
  'coverBushingTm': 'Cover bushing TM',
  'coverBushingTr': 'Cover bushing TR',
  'coverArrester': 'Cover arrester',
  'jumperanAtas': 'Jumperan atas',
  'jumperanBawah': 'Jumperan bawah',
};

/// Nilai ukur per periode: kunci kirim, label, jenis (tegangan / beban).
const List<(String, String, String)> nilaiUkurInsDu = [
  ('teganganRS', 'R-S', 'V'),
  ('teganganRT', 'R-T', 'V'),
  ('teganganST', 'S-T', 'V'),
  ('teganganRN', 'R-N', 'V'),
  ('teganganSN', 'S-N', 'V'),
  ('teganganTN', 'T-N', 'V'),
  ('bebanR', 'R', 'A'),
  ('bebanS', 'S', 'A'),
  ('bebanT', 'T', 'A'),
  ('bebanN', 'N', 'A'),
];

/// Batas nilai (sama dengan YAN_TEGANGAN_MAKS_ / YAN_BEBAN_MAKS_ server).
const num teganganMaksInsDu = 1000;
const num bebanMaksInsDu = 3000;

/// Master Inspeksi Gardu untuk HP.
class MasterInsDu {
  MasterInsDu(Map<String, dynamic> m)
      : gardu = [for (final g in daftarInsDu(m['gardu'])) GarduInsDu(g)]..removeWhere((g) => g.garduId.isEmpty),
        jenisTemuan = {
          for (final j in daftarInsDu(m['jenisTemuan']))
            if (teksInsDu(j['nama']).isNotEmpty) teksInsDu(j['nama']): teksInsDu(j['jenisTemuanId']),
        },
        tierJenisTemuan = {
          for (final j in daftarInsDu(m['jenisTemuan']))
            if (teksInsDu(j['nama']).isNotEmpty)
              teksInsDu(j['nama']): [for (final t in (j['tierInspeksi'] as List<dynamic>? ?? const <dynamic>[])) '$t'],
        },
        tier = [for (final t in (m['tier'] as List<dynamic>? ?? const ['Tier 1', 'Tier 2'])) '$t'],
        tierGardu = [for (final t in (m['tierGardu'] as List<dynamic>? ?? tierGarduInsDu)) '$t'],
        cover = {
          for (final c in daftarInsDu(m['cover']))
            if (teksInsDu(c['kunci']).isNotEmpty) teksInsDu(c['kunci']): [for (final p in (c['pilihan'] as List<dynamic>? ?? const <dynamic>[])) '$p'],
        };

  final List<GarduInsDu> gardu;
  final Map<String, String> jenisTemuan;
  final Map<String, List<String>> tierJenisTemuan;
  final List<String> tier;

  /// v1.0.14: pilihan tier gardu (boleh dua tier sekaligus).
  final List<String> tierGardu;
  final Map<String, List<String>> cover;

  GarduInsDu? garduDari(String? id) {
    for (final g in gardu) {
      if (g.garduId == id) return g;
    }
    return null;
  }

  /// Jenis temuan objek Gardu yang cocok dengan tier (kriteria tier kosong = semua tier).
  List<String> jenisUntuk(String? tier) => [
        for (final n in jenisTemuan.keys)
          if ((tierJenisTemuan[n] ?? const <String>[]).isEmpty || (tier ?? '').trim().isEmpty || tierJenisTemuan[n]!.contains(tier!.trim())) n,
      ];
}

/// Hasil ukur (rumus hasilUkurGardu_ server): kVA = Σ(I fasa × V fasa-netral)/1000, persen = kVA / kapasitas,
/// ketidakseimbangan = (maks - rata) / rata.
({double kva, double? persen, String kategori, double tidakSeimbang}) hitungUkurInsDu(Map<String, num?> n, num? kapasitas) {
  double v(String k) => (n[k] ?? 0).toDouble();
  final r = v('bebanR'), s = v('bebanS'), t = v('bebanT');
  final maks = [r, s, t].reduce((a, b) => a > b ? a : b), rata = (r + s + t) / 3;
  final kva = (r * v('teganganRN') + s * v('teganganSN') + t * v('teganganTN')) / 1000;
  final persen = kapasitas != null && kapasitas > 0 ? _bulat2(kva / kapasitas * 100) : null;
  return (
    kva: _bulat2(kva),
    persen: persen,
    kategori: kategoriBebanInsDu(persen),
    tidakSeimbang: rata > 0 ? _bulat2((maks - rata) / rata * 100) : 0,
  );
}

/// Kategori beban (kategoriBeban_ server): < 50 Underload, < 80 Cukup, < 100 Overload, selebihnya Buruk.
String kategoriBebanInsDu(num? persen) {
  if (persen == null || persen.isNaN) return '';
  if (persen < 50) return 'Underload';
  if (persen < 80) return 'Cukup';
  if (persen < 100) return 'Overload';
  return 'Buruk';
}

double _bulat2(double x) => (x * 100).roundToDouble() / 100;

String _angka(num n) => n == n.roundToDouble() ? n.toInt().toString() : n.toStringAsFixed(1);

String angkaInsDuTampil(num? n) => n == null ? '-' : _angka(n);

/// v1.0.14: pilihan tier gardu (sama dengan INSDU_TIER_PILIHAN_ server).
const List<String> tierGarduInsDu = ['Tier 1', 'Tier 2', 'Tier 1 & Tier 2'];

/// 'Tier 1 & Tier 2' -> ['Tier 1', 'Tier 2'].
List<String> tierDaftarInsDu(Object? tier) =>
    teksInsDu(tier).split('&').map((x) => x.trim()).where((x) => x == 'Tier 1' || x == 'Tier 2').toList();

/// Gardu perlu pengukuran LWBP / WBP = tier memuat Tier 1 (tanpa tier = data lama, dianggap perlu).
bool perluUkurInsDu(Object? tier) {
  final l = tierDaftarInsDu(tier);
  return l.isEmpty || l.contains('Tier 1');
}

/// statusUkur realisasi: BELUM / LWBP / LENGKAP / TANPA_UKUR (Tier 2 saja).
String labelStatusUkur(String s) {
  switch (s.trim()) {
    case 'TANPA_UKUR':
      return 'Tier 2 · tanpa pengukuran';
    case 'LENGKAP':
      return 'LWBP + WBP lengkap';
    case 'LWBP':
      return 'LWBP terisi · WBP belum';
    default:
      return 'Belum diukur';
  }
}

/// Ringkasan laporan hari ini: jumlah gardu, masuk laporan (ber-LWBP), lengkap WBP, temuan, temuan tertinggal.
({int gardu, int masuk, int lengkap, int temuan, int tertinggal}) ringkasInsDu(List<Map<String, dynamic>> realisasi) {
  var m = 0, l = 0, t = 0, tt = 0;
  for (final r in realisasi) {
    final s = teksInsDu(r['statusUkur']);
    if (r['masukLaporan'] == true) m++;
    if (s == 'LENGKAP') l++;
    t += daftarInsDu(r['temuan']).length;
    tt += daftarInsDu(r['temuanTertinggal']).length;
  }
  return (gardu: realisasi.length, masuk: m, lengkap: l, temuan: t, tertinggal: tt);
}

/// Teks peringatan tunggakan laporan sebelumnya. v1.0.16: gardu tanpa LWBP juga termasuk.
String teksTunggakanInsDu(Map<String, dynamic> t) {
  final g = [for (final r in daftarInsDu(t['realisasi'])) teksInsDu(r['noGardu'])].where((x) => x.isNotEmpty).toList();
  return 'Pengukuran ${g.length} gardu laporan ${teksInsDu(t['kodeHeader'])} belum lengkap'
      '${g.isEmpty ? '' : ' (${g.join(', ')})'}. Isi susulan atau hapus gardunya sebelum membuat laporan baru.';
}

/// v1.0.16: periode yang harus diisi berikutnya untuk gardu tunggakan: LWBP (belum diukur sama sekali), WBP, atau
/// null (lengkap di HP / server).
String? periodeSusulanInsDu(Map<String, dynamic> r) {
  final pk = petaInsDu(r['pengukuran']);
  if (pk?['lwbp'] == null) return 'LWBP';
  if (pk?['wbp'] == null) return 'WBP';
  return null;
}

/// Gardu yang belum ada di laporan hari ini (cegah GARDU_GANDA di HP).
List<GarduInsDu> garduBelumDipakai(MasterInsDu m, List<Map<String, dynamic>> realisasi) {
  final dipakai = {for (final r in realisasi) teksInsDu(r['garduId'])};
  return [for (final g in m.gardu) if (!dipakai.contains(g.garduId)) g];
}

/// v1.0.14 (format WA v1 Tek-WAEngine, Realisasi Inspeksi Gardu): satu blok per penyulang, tiap gardu bernomor dengan
/// data trafo / PHB-TR dari Master Gardu, tier, beban LWBP / WBP (Tier 1), dan temuan (Nihil kalau tidak ada).
/// Hanya gardu yang masuk laporan (Tier 2 saja, atau Tier 1 yang sudah LWBP).
String waTeksInsDu({
  required String tanggalTampil,
  required Map<String, dynamic> header,
  required List<Map<String, dynamic>> realisasi,
  Map<String, GarduInsDu> gardu = const {},
}) {
  String strip(Object? v) => teksInsDu(v).isEmpty ? '-' : teksInsDu(v);
  final b = <String>[
    '*Realisasi Inspeksi Gardu*',
    '-' * 67,
    'Hari / Tanggal : $tanggalTampil',
    'Koordinat Awal : ${strip(header['koordinatAwal'])}',
    'Koordinat Akhir : ${strip(header['koordinatAkhir'])}',
    'Stand KM Awal / Akhir : ${strip(header['kmAwal'])} / ${strip(header['kmAkhir'])}',
  ];
  final urut = <String>[];
  final per = <String, List<Map<String, dynamic>>>{};
  for (final r in realisasi) {
    if (r['masukLaporan'] != true) continue;
    final p = teksInsDu(r['penyulang']).isEmpty ? '-' : teksInsDu(r['penyulang']);
    if (!per.containsKey(p)) urut.add(p);
    per.putIfAbsent(p, () => []).add(r);
  }
  String beban(Map<String, dynamic>? x) {
    if (x == null) return '-';
    final kva = angkaInsDu(x['kva']), persen = angkaInsDu(x['persen']);
    return '${angkaInsDuTampil(kva)} kVA${persen == null ? '' : ' (${angkaInsDuTampil(persen)}%)'}';
  }

  for (final pen in urut) {
    final daftar = per[pen]!;
    final section = <String>[];
    for (final r in daftar) {
      final sc = teksInsDu(r['section']);
      if (sc.isNotEmpty && !section.contains(sc)) section.add(sc);
    }
    b
      ..add('')
      ..add('Penyulang : *$pen*')
      ..add('Section : *${section.isEmpty ? '-' : section.join(', ')}*');
    for (var i = 0; i < daftar.length; i++) {
      final r = daftar[i];
      final g = gardu[teksInsDu(r['garduId'])];
      final kap = angkaInsDu(r['kapasitasKva']) ?? g?.kapasitasKva;
      final merk = teksInsDu(r['merkTrafo']).isNotEmpty ? teksInsDu(r['merkTrafo']) : (g?.merk ?? '');
      b
        ..add('')
        ..add('*${i + 1}. ${[teksInsDu(r['noGardu']), merk, if (kap != null) '${angkaInsDuTampil(kap)} kVA'].where((x) => x.isNotEmpty).join(' ')}*')
        ..add('- Merk Box PHB-TR : ${strip(g?.merkPhb)}')
        ..add('- Nomor Seri Box PHB-TR : ${strip(g?.seriPhb)}')
        ..add('- Tahun Box PHB-TR : ${strip(g?.tahunPhb)}')
        ..add('Alamat : ${strip(r['alamat'])}')
        ..add('Inspeksi Tier : ${strip(r['tier'])}');
      if (perluUkurInsDu(r['tier'])) {
        final pk = petaInsDu(r['pengukuran']);
        b.add('Beban LWBP : ${beban(petaInsDu(pk?['lwbp']))} · WBP : ${beban(petaInsDu(pk?['wbp']))}');
      }
      b.add('Temuan :');
      final temuan = [
        for (final t in daftarInsDu(r['temuan'])) teksInsDu(t['jenisTemuan']),
        for (final t in daftarInsDu(r['temuanTertinggal'])) '${teksInsDu(t['jenisTemuan'])} (belum diperbaiki)',
      ].where((x) => x.isNotEmpty).toList();
      if (temuan.isEmpty) {
        b.add('1. Nihil');
      } else {
        for (var j = 0; j < temuan.length; j++) {
          b.add('${j + 1}. ${temuan[j]}');
        }
      }
    }
  }
  if (urut.isEmpty) b..add('')..add('Belum ada gardu yang masuk laporan.');
  return b.join('\n');
}
