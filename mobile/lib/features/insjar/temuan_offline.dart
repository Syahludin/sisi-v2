import 'dart:convert';

import '../hartek/hartek_store.dart' show GudangHartek;

/// v1.0.17 (permintaan Master Guswan 22 Okt 2026): daftar temuan inspeksi OFFLINE untuk menu Temuan Inspeksi (admin).
/// Temuan rentang tanggal diunduh sekali (getTemuanInspeksi dari / sampai) lalu disimpan di HP (master_cache), jadi tab
/// Daftar Temuan langsung tampil tanpa menunggu server. Filter + ringkasan dihitung di HP.

String _t(Object? v) => v?.toString().trim() ?? '';

/// Kategori filter multi-pilihan.
enum KategoriFilterTemuan { jenis, tanggal, penyulang, tim }

extension LabelKategoriFilterTemuan on KategoriFilterTemuan {
  String get label => switch (this) {
        KategoriFilterTemuan.jenis => 'Jenis Temuan',
        KategoriFilterTemuan.tanggal => 'Tanggal Inspeksi',
        KategoriFilterTemuan.penyulang => 'Penyulang',
        KategoriFilterTemuan.tim => 'Tim Inspeksi',
      };
}

/// Nilai satu temuan untuk kategori filter (kosong = '-').
String nilaiFilterTemuan(Map<String, dynamic> t, KategoriFilterTemuan k) {
  final v = switch (k) {
    KategoriFilterTemuan.jenis => _t(t['jenisTemuan']),
    KategoriFilterTemuan.tanggal => _t(t['tanggal']),
    KategoriFilterTemuan.penyulang => _t(t['penyulang']),
    KategoriFilterTemuan.tim => timInspeksiTemuan(t),
  };
  return v.isEmpty ? '-' : v;
}

/// Tim inspeksi asal temuan: Admin / nama tim / Petugas (sama dengan timInspeksiWo).
String timInspeksiTemuan(Map<String, dynamic> t) =>
    _t(t['sumber']) == 'ADMIN' ? 'Admin' : (_t(t['tim']).isEmpty ? 'Petugas' : _t(t['tim']));

/// Filter multi-pilihan. Kategori kosong = semua nilai.
class FilterTemuan {
  const FilterTemuan([this.pilih = const {}]);
  final Map<KategoriFilterTemuan, Set<String>> pilih;

  Set<String> dari(KategoriFilterTemuan k) => pilih[k] ?? const <String>{};

  bool get kosong => pilih.values.every((s) => s.isEmpty);

  int get jumlah => pilih.values.fold<int>(0, (a, s) => a + s.length);

  FilterTemuan atur(KategoriFilterTemuan k, Set<String> nilai) => FilterTemuan({...pilih, k: {...nilai}});

  /// Ketuk satu nilai (mis. dari kartu ringkasan): ada = dilepas, belum = ditambah.
  FilterTemuan alih(KategoriFilterTemuan k, String nilai) {
    final s = {...dari(k)};
    if (!s.remove(nilai)) s.add(nilai);
    return atur(k, s);
  }

  bool cocok(Map<String, dynamic> t) {
    for (final e in pilih.entries) {
      if (e.value.isEmpty) continue;
      if (!e.value.contains(nilaiFilterTemuan(t, e.key))) return false;
    }
    return true;
  }

  List<Map<String, dynamic>> saring(List<Map<String, dynamic>> semua) => kosong ? semua : [for (final t in semua) if (cocok(t)) t];
}

/// Pilihan filter satu kategori dari daftar (unik). Tanggal = terbaru dulu, lainnya abjad.
List<String> pilihanFilterTemuan(List<Map<String, dynamic>> semua, KategoriFilterTemuan k) {
  final l = {for (final t in semua) nilaiFilterTemuan(t, k)}.toList();
  return k == KategoriFilterTemuan.tanggal ? (l..sort((a, b) => b.compareTo(a))) : (l..sort());
}

/// v1.0.21 (permintaan Master Guswan 23 Okt 2026): status penanganan temuan dari WO-nya. Bukan filter: dihitung dari daftar yang
/// sedang tampil, jadi berlaku di semua kondisi filter (per section, per jenis, per penyulang).
enum StatusTemuan { belumTim, diTim, dikerjakan, selesai }

extension LabelStatusTemuan on StatusTemuan {
  String get label => switch (this) {
        StatusTemuan.belumTim => 'Belum ada tim',
        StatusTemuan.diTim => 'Di tim, belum dikerjakan',
        StatusTemuan.dikerjakan => 'Sedang dikerjakan',
        StatusTemuan.selesai => 'Selesai',
      };

  String get pendek => switch (this) {
        StatusTemuan.belumTim => 'belum tim',
        StatusTemuan.diTim => 'di tim',
        StatusTemuan.dikerjakan => 'dikerjakan',
        StatusTemuan.selesai => 'selesai',
      };
}

/// Status WO temuan: kosong = belum diteruskan ke tim (StatusWo di wo_bantu).
StatusTemuan statusTemuan(Map<String, dynamic> t) {
  final wo = t['wo'];
  return switch (wo is Map ? _t(wo['status']) : '') {
    'SELESAI' => StatusTemuan.selesai,
    'DIKERJAKAN' => StatusTemuan.dikerjakan,
    'TERKIRIM' => StatusTemuan.diTim,
    _ => StatusTemuan.belumTim,
  };
}

/// Jumlah temuan per [StatusTemuan] (indeks = StatusTemuan.index).
List<int> hitungStatusTemuan(Iterable<Map<String, dynamic>> l) {
  final n = List<int>.filled(StatusTemuan.values.length, 0);
  for (final t in l) {
    n[statusTemuan(t).index]++;
  }
  return n;
}

typedef RingkasJenis = ({String jenis, int jumlah, List<int> status});

/// Jumlah temuan per jenis, terbanyak dulu (sama banyak = abjad). v1.0.21: + jumlah per status.
List<RingkasJenis> ringkasJenisTemuan(List<Map<String, dynamic>> l) {
  final grup = <String, List<Map<String, dynamic>>>{};
  for (final t in l) {
    grup.putIfAbsent(nilaiFilterTemuan(t, KategoriFilterTemuan.jenis), () => []).add(t);
  }
  final hasil = [for (final e in grup.entries) (jenis: e.key, jumlah: e.value.length, status: hitungStatusTemuan(e.value))]
    ..sort((a, b) => b.jumlah != a.jumlah ? b.jumlah - a.jumlah : a.jenis.compareTo(b.jenis));
  return hasil;
}

/// v1.0.18: lokasi section temuan ('PENYULANG · Section'; gardu tanpa section = nomor gardu).
String sectionTemuan(Map<String, dynamic> t) {
  final p = _t(t['penyulang']), s = _t(t['section']).isNotEmpty ? _t(t['section']) : _t(t['noGardu']);
  if (p.isEmpty && s.isEmpty) return '-';
  return [if (p.isNotEmpty) p, if (s.isNotEmpty) s].join(' · ');
}

/// v1.0.18 (permintaan Master Guswan 22 Okt 2026): ringkasan per section, tiap section berisi jumlah per jenis temuan.
/// Section terbanyak dulu (sama banyak = abjad); jenis di dalamnya urut sama dengan [ringkasJenisTemuan].
List<RingkasSection> ringkasSectionTemuan(List<Map<String, dynamic>> l) {
  final grup = <String, List<Map<String, dynamic>>>{};
  for (final t in l) {
    grup.putIfAbsent(sectionTemuan(t), () => []).add(t);
  }
  final hasil = [
    for (final e in grup.entries) (section: e.key, jumlah: e.value.length, jenis: ringkasJenisTemuan(e.value), status: hitungStatusTemuan(e.value))
  ]
    ..sort((a, b) => b.jumlah != a.jumlah ? b.jumlah - a.jumlah : a.section.compareTo(b.section));
  return hasil;
}

/// v1.0.19: urutan section per penyulang dari server ([{nama, section: [...]}], kolom urutan db_Jaringan).
Map<String, List<String>> urutanSectionTemuan(Object? v) => {
      for (final p in (v is List ? v : const <dynamic>[]))
        if (p is Map) _t(p['nama']): [for (final s in (p['section'] as List<dynamic>? ?? const <dynamic>[])) _t(s)],
    };

/// Nama section temuan (gardu tanpa section = nomor gardu, kosong = '-').
String namaSectionTemuan(Map<String, dynamic> t) {
  final s = _t(t['section']).isNotEmpty ? _t(t['section']) : _t(t['noGardu']);
  return s.isEmpty ? '-' : s;
}

String namaPenyulangTemuan(Map<String, dynamic> t) => _t(t['penyulang']).isEmpty ? '-' : _t(t['penyulang']);

typedef RingkasSection = ({String section, int jumlah, List<RingkasJenis> jenis, List<int> status});
typedef RingkasPenyulang = ({String penyulang, int jumlah, List<RingkasSection> section, List<int> status});

/// v1.0.19 (permintaan Master Guswan 23 Okt 2026): ringkasan per penyulang (abjad) > section (kolom urutan db_Jaringan; section di
/// luar master di belakang, abjad) > jumlah per jenis temuan.
List<RingkasPenyulang> ringkasPenyulangTemuan(List<Map<String, dynamic>> l, Map<String, List<String>> urutan) {
  final grup = <String, Map<String, List<Map<String, dynamic>>>>{};
  for (final t in l) {
    grup.putIfAbsent(namaPenyulangTemuan(t), () => {}).putIfAbsent(namaSectionTemuan(t), () => []).add(t);
  }
  final hasil = <RingkasPenyulang>[];
  for (final p in grup.keys.toList()..sort()) {
    final master = urutan[p] ?? const <String>[];
    int pos(String s) {
      final i = master.indexOf(s);
      return i < 0 ? 1 << 30 : i;
    }

    final sec = grup[p]!.keys.toList()..sort((a, b) => pos(a) != pos(b) ? pos(a) - pos(b) : a.compareTo(b));
    final isi = [
      for (final s in sec)
        (section: s, jumlah: grup[p]![s]!.length, jenis: ringkasJenisTemuan(grup[p]![s]!), status: hitungStatusTemuan(grup[p]![s]!))
    ];
    hasil.add((
      penyulang: p,
      jumlah: isi.fold<int>(0, (a, x) => a + x.jumlah),
      section: isi,
      status: hitungStatusTemuan([for (final s in grup[p]!.values) ...s]),
    ));
  }
  return hasil;
}

/// Temuan satu penyulang / section / jenis (null = semua).
List<Map<String, dynamic>> saringTemuan(List<Map<String, dynamic>> l, {String? penyulang, String? section, String? jenis}) => [
      for (final t in l)
        if ((penyulang == null || namaPenyulangTemuan(t) == penyulang) &&
            (section == null || namaSectionTemuan(t) == section) &&
            (jenis == null || nilaiFilterTemuan(t, KategoriFilterTemuan.jenis) == jenis))
          t,
    ];

/// Simpanan daftar temuan offline per akun (master_cache).
class SimpananTemuanOffline {
  SimpananTemuanOffline(this._gudang);
  final GudangHartek _gudang;

  static String kunci(String userId) => 'temuan_offline_$userId';

  /// Hasil: {dari, sampai, diambil, temuan: [...]} atau null (belum pernah diunduh).
  Future<Map<String, dynamic>?> baca(String userId) async {
    try {
      final r = await _gudang.bacaMaster(kunci(userId));
      return r == null ? null : Map<String, dynamic>.from(jsonDecode(r.json) as Map);
    } catch (_) {
      return null;
    }
  }

  Future<void> tulis(String userId, Map<String, dynamic> isi) => _gudang.tulisMaster(kunci(userId), jsonEncode(isi));

  /// Temuan baru / berubah (mis. sesudah admin menyimpan temuan) masuk ke simpanan tanpa unduh ulang semuanya.
  static Map<String, dynamic> sisipkan(Map<String, dynamic> isi, Map<String, dynamic> temuan) {
    final id = _t(temuan['temuanId']);
    final l = [
      for (final t in (isi['temuan'] as List<dynamic>? ?? const <dynamic>[]))
        if (t is Map && _t(t['temuanId']) != id) Map<String, dynamic>.from(t),
    ];
    l.insert(0, temuan);
    l.sort((a, b) {
      final c = _t(b['tanggal']).compareTo(_t(a['tanggal']));
      return c != 0 ? c : _t(a['kodeTemuan']).compareTo(_t(b['kodeTemuan']));
    });
    return {...isi, 'temuan': l};
  }
}
