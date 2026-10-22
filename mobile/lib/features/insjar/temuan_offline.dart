import 'dart:convert';

import '../hartek/hartek_store.dart' show GudangHartek;

/// v1.0.17 (permintaan kvlar 22 Okt 2026): daftar temuan inspeksi OFFLINE untuk menu Temuan Inspeksi (admin).
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

/// Jumlah temuan per jenis, terbanyak dulu (sama banyak = abjad).
List<({String jenis, int jumlah})> ringkasJenisTemuan(List<Map<String, dynamic>> l) {
  final n = <String, int>{};
  for (final t in l) {
    final j = nilaiFilterTemuan(t, KategoriFilterTemuan.jenis);
    n[j] = (n[j] ?? 0) + 1;
  }
  final hasil = [for (final e in n.entries) (jenis: e.key, jumlah: e.value)]
    ..sort((a, b) => b.jumlah != a.jumlah ? b.jumlah - a.jumlah : a.jenis.compareTo(b.jenis));
  return hasil;
}

/// v1.0.18: lokasi section temuan ('PENYULANG · Section'; gardu tanpa section = nomor gardu).
String sectionTemuan(Map<String, dynamic> t) {
  final p = _t(t['penyulang']), s = _t(t['section']).isNotEmpty ? _t(t['section']) : _t(t['noGardu']);
  if (p.isEmpty && s.isEmpty) return '-';
  return [if (p.isNotEmpty) p, if (s.isNotEmpty) s].join(' · ');
}

/// v1.0.18 (permintaan kvlar 22 Okt 2026): ringkasan per section, tiap section berisi jumlah per jenis temuan.
/// Section terbanyak dulu (sama banyak = abjad); jenis di dalamnya urut sama dengan [ringkasJenisTemuan].
List<({String section, int jumlah, List<({String jenis, int jumlah})> jenis})> ringkasSectionTemuan(List<Map<String, dynamic>> l) {
  final grup = <String, List<Map<String, dynamic>>>{};
  for (final t in l) {
    grup.putIfAbsent(sectionTemuan(t), () => []).add(t);
  }
  final hasil = [for (final e in grup.entries) (section: e.key, jumlah: e.value.length, jenis: ringkasJenisTemuan(e.value))]
    ..sort((a, b) => b.jumlah != a.jumlah ? b.jumlah - a.jumlah : a.section.compareTo(b.section));
  return hasil;
}

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
