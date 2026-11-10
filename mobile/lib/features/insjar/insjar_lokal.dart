import 'dart:convert';

import '../hartek/hartek_lokal.dart';

/// v1.0.0 (permintaan Master Guswan 19 Okt 2026): Inspeksi Jaringan lokal + kirim otomatis (pola sama dengan HartekLokal).
///
/// Logika murni dokumen laporan harian di HP (tanpa sqflite / jaringan, diuji di insjar_lokal_test.dart).
/// Bentuk dokumen = jawaban getInsJarHarian: `{tanggal, header, realisasi: [penyulang utama {temuan: [...]}]}`.
/// Tanda kirim per node sama dengan Hartek: `_sinkron` / `_galat` (pembuatan), `_ubah` / `_galatUbah` (perubahan
/// Laporan Utama / penyulang utama), foto temuan `fotoLokal` / `_fotoSinkron` / `_fotoGalat` / `foto` (link server).
class InsJarLokal {
  InsJarLokal._();

  static const lokal = HartekLokal.lokal, gagal = HartekLokal.gagal;
  static const sinkron = HartekLokal.sinkron, galat = HartekLokal.galat, ubah = HartekLokal.ubah, galatUbah = HartekLokal.galatUbah;

  /// Foto temuan (sama dengan INSJAR_FOTO_ server).
  static const slotFoto = ['TEMUAN', 'TIANG'];
  static const labelFoto = {'TEMUAN': 'Foto temuan', 'TIANG': 'Foto tiang'};

  static const endpoint = {
    'buatHeader': 'buatHeaderInsJar',
    'ubahHeader': 'ubahHeaderInsJar',
    'simpanRealisasi': 'simpanRealisasiInsJar',
    'ubahRealisasi': 'ubahRealisasiInsJar',
    'simpanTemuan': 'simpanTemuanInsJar',
    'ubahTemuan': 'ubahTemuanInsJar', // v1.0.5
    'uploadFoto': 'uploadFotoInsJar', // target = '<temuanId>#<SLOT>'
  };

  static const kodeAksi = {'buatHeader': 'kodeHeader', 'simpanRealisasi': 'kodeRealisasi', 'simpanTemuan': 'kodeTemuan'};

  static Map<String, dynamic> kosong(String tanggal) => {'tanggal': tanggal, 'header': null, 'realisasi': <dynamic>[]};

  static Map<String, dynamic> salin(Map<String, dynamic> m) => Map<String, dynamic>.from(jsonDecode(jsonEncode(m)) as Map);

  static String _t(Object? v) => v?.toString().trim() ?? '';

  static List<Map<String, dynamic>> daftar(Object? v) => HartekLokal.daftar(v);

  static List<dynamic> _anak(Map<String, dynamic> node, String kunci) {
    final v = node[kunci];
    if (v is List) return v;
    final baru = <dynamic>[];
    node[kunci] = baru;
    return baru;
  }

  static bool tertunda(Map<String, dynamic>? n) => n != null && n[sinkron] != null;

  static String targetFoto(String temuanId, String slot) => '$temuanId#$slot';

  /// Induk node yang dibuat / diubah aksi ini (null = header).
  static String? induk(String aksi, Map<String, dynamic> data) {
    switch (aksi) {
      case 'buatHeader':
        return null;
      case 'ubahHeader':
      case 'simpanRealisasi':
        return _t(data['headerId']);
      case 'ubahRealisasi':
      case 'simpanTemuan':
        return _t(data['realisasiId']);
      case 'uploadFoto':
      case 'ubahTemuan':
        return _t(data['temuanId']);
      default:
        return null;
    }
  }

  static bool aksiBuat(String aksi) => aksi == 'buatHeader' || aksi == 'simpanRealisasi' || aksi == 'simpanTemuan';

  /// v1.0.5: aksi PERUBAHAN node yang sudah diterima server (revision wajib).
  static bool aksiUbah(String aksi) => aksi == 'ubahHeader' || aksi == 'ubahRealisasi' || aksi == 'ubahTemuan';

  /// v1.0.5: isian temuan yang bisa diubah petugas (sama dengan form temuan, tanpa foto).
  static const isianTemuan = [
    'objekInspeksi', 'tierInspeksi', 'section', 'jenisTemuan', 'jenisTemuanId', 'nomorTiang', 'segmen', 'deskripsi', 'koordinat'
  ];

  // ---------- cari ----------

  static Map<String, dynamic>? header(Map<String, dynamic> doc) =>
      doc['header'] is Map<String, dynamic> ? doc['header'] as Map<String, dynamic> : null;

  static Map<String, dynamic>? realisasi(Map<String, dynamic> doc, String realisasiId) {
    for (final r in daftar(doc['realisasi'])) {
      if (_t(r['realisasiId']) == realisasiId) return r;
    }
    return null;
  }

  static Map<String, dynamic>? temuan(Map<String, dynamic> doc, String temuanId) {
    for (final r in daftar(doc['realisasi'])) {
      for (final t in daftar(r['temuan'])) {
        if (_t(t['temuanId']) == temuanId) return t;
      }
    }
    return null;
  }

  static Map<String, dynamic>? cari(Map<String, dynamic> doc, String id) {
    final h = header(doc);
    if (h != null && _t(h['headerId']) == id) return h;
    return realisasi(doc, id) ?? temuan(doc, id);
  }

  /// ID node + turunannya (dipakai saat membuang data yang ditolak).
  static List<String> idTurunan(Map<String, dynamic> doc, String id) {
    final h = header(doc);
    List<String> dariReal(Map<String, dynamic> r) => [_t(r['realisasiId']), for (final t in daftar(r['temuan'])) _t(t['temuanId'])];
    if (h != null && _t(h['headerId']) == id) {
      return [id, for (final r in daftar(doc['realisasi'])) ...dariReal(r)];
    }
    final r = realisasi(doc, id);
    if (r != null) return dariReal(r);
    return temuan(doc, id) == null ? <String>[] : [id];
  }

  // ---------- tulis lokal ----------

  static void buatHeader(Map<String, dynamic> doc, Map<String, dynamic> h) {
    doc['header'] = {...h, sinkron: lokal};
    doc['realisasi'] = <dynamic>[];
  }

  static void ubahIsianHeader(Map<String, dynamic> doc, Map<String, dynamic> isian, {required bool tandaiUbah}) {
    final h = header(doc);
    if (h == null) return;
    for (final k in const ['koordinatAwal', 'koordinatAkhir']) {
      if (isian.containsKey(k) && !isian.containsKey('_akurasi_$k')) h.remove('_akurasi_$k');
    }
    h.addAll(isian);
    if (tandaiUbah) {
      h[ubah] = lokal;
      h.remove(galatUbah);
    }
  }

  static void tambahRealisasi(Map<String, dynamic> doc, Map<String, dynamic> node) =>
      _anak(doc, 'realisasi').add({...node, 'temuan': <dynamic>[], sinkron: lokal});

  static bool ubahIsianRealisasi(Map<String, dynamic> doc, String realisasiId, Map<String, dynamic> isian, {required bool tandaiUbah}) {
    final r = realisasi(doc, realisasiId);
    if (r == null) return false;
    r.addAll(isian);
    if (tandaiUbah) {
      r[ubah] = lokal;
      r.remove(galatUbah);
    }
    return true;
  }

  /// v1.0.5: ubah isian temuan (isian lengkap: yang tidak ada di [isian] dikosongkan). Penyulang, kode, foto tetap.
  static bool ubahIsianTemuan(Map<String, dynamic> doc, String temuanId, Map<String, dynamic> isian, {required bool tandaiUbah}) {
    final t = temuan(doc, temuanId);
    if (t == null) return false;
    for (final k in isianTemuan) {
      t[k] = isian[k] ?? '';
    }
    if (tandaiUbah) {
      t[ubah] = lokal;
      t.remove(galatUbah);
    }
    return true;
  }

  /// v1.0.5: semua temuan laporan (urut penyulang utama), tiap temuan dibawa bersama penyulang utamanya.
  static List<({Map<String, dynamic> realisasi, Map<String, dynamic> temuan})> semuaTemuan(Map<String, dynamic>? doc) => [
        if (doc != null)
          for (final r in daftar(doc['realisasi']))
            for (final t in daftar(r['temuan'])) (realisasi: r, temuan: t),
      ];

  /// v1.0.5: kelompok temuan per jenis temuan (jumlah terbanyak dulu, lalu nama). Jenis kosong = 'Tanpa jenis'.
  static List<({String jenis, List<({Map<String, dynamic> realisasi, Map<String, dynamic> temuan})> isi})> grupTemuan(
      Map<String, dynamic>? doc) {
    final urut = <String>[];
    final peta = <String, List<({Map<String, dynamic> realisasi, Map<String, dynamic> temuan})>>{};
    for (final x in semuaTemuan(doc)) {
      final j = _t(x.temuan['jenisTemuan']).isEmpty ? 'Tanpa jenis' : _t(x.temuan['jenisTemuan']);
      if (!peta.containsKey(j)) urut.add(j);
      peta.putIfAbsent(j, () => []).add(x);
    }
    urut.sort((a, b) {
      final n = peta[b]!.length.compareTo(peta[a]!.length);
      return n != 0 ? n : a.compareTo(b);
    });
    return [for (final j in urut) (jenis: j, isi: peta[j]!)];
  }

  static bool tambahTemuan(Map<String, dynamic> doc, String realisasiId, Map<String, dynamic> node) {
    final r = realisasi(doc, realisasiId);
    if (r == null) return false;
    _anak(r, 'temuan').add({...node, sinkron: lokal});
    return true;
  }

  /// v1.0.5: penyulang + tier + section sama tidak boleh dua kali di satu laporan (REALISASI_GANDA server).
  static bool realisasiGanda(Map<String, dynamic> doc, String penyulang, String tier, String section, {String? kecuali}) =>
      daftar(doc['realisasi']).any((r) =>
          _t(r['penyulang']) == penyulang.trim() &&
          _t(r['tier']) == tier.trim() &&
          _t(r['section']) == section.trim() &&
          (kecuali == null || _t(r['realisasiId']) != kecuali));

  /// v1.0.5: penyulang utama dikelompokkan per penyulang (urut kemunculan). Tiap penyulang = semua section-nya.
  static List<({String penyulang, List<Map<String, dynamic>> realisasi})> grupPenyulang(Map<String, dynamic>? doc) {
    final urut = <String>[];
    final peta = <String, List<Map<String, dynamic>>>{};
    for (final r in daftar(doc?['realisasi'])) {
      final p = _t(r['penyulang']);
      if (!peta.containsKey(p)) urut.add(p);
      peta.putIfAbsent(p, () => []).add(r);
    }
    return [for (final p in urut) (penyulang: p, realisasi: peta[p]!)];
  }

  /// v1.0.5: penyulang utama dalam satu penyulang (semua section).
  static List<Map<String, dynamic>> realisasiPenyulang(Map<String, dynamic>? doc, String penyulang) =>
      daftar(doc?['realisasi']).where((r) => _t(r['penyulang']) == penyulang.trim()).toList();

  /// v1.0.5: jumlah temuan di penyulang utama (dipakai kunci section).
  static int temuanRealisasi(Map<String, dynamic> r) => daftar(r['temuan']).length;

  static void tandai(Map<String, dynamic> doc, String id, String? status, {String? pesan}) {
    final n = cari(doc, id);
    if (n == null) return;
    if (status == null) {
      n.remove(sinkron);
      n.remove(galat);
      return;
    }
    n[sinkron] = status;
    if (pesan == null) {
      n.remove(galat);
    } else {
      n[galat] = pesan;
    }
  }

  /// Tanda PERUBAHAN (Laporan Utama / penyulang utama). null = diterima / dibatalkan.
  static void tandaiUbah(Map<String, dynamic> doc, String id, String? status, {String? pesan}) {
    final n = cari(doc, id);
    if (n == null) return;
    if (status == null) {
      n.remove(ubah);
      n.remove(galatUbah);
      return;
    }
    n[ubah] = status;
    if (pesan == null) {
      n.remove(galatUbah);
    } else {
      n[galatUbah] = pesan;
    }
  }

  /// Jawaban server: kode diisi, tanda dibersihkan. simpanTemuan juga memperbarui jumlah temuan penyulang utama.
  static void diterima(Map<String, dynamic> doc, String aksi, String id, Map<String, dynamic> hasil) {
    final n = cari(doc, id);
    if (n == null) return;
    final kolom = kodeAksi[aksi];
    if (kolom != null && _t(hasil[kolom]).isNotEmpty) n[kolom] = _t(hasil[kolom]);
    n.remove(sinkron);
    n.remove(galat);
  }

  static void gantiHeaderId(Map<String, dynamic> doc, String lama, String baru, String kode) {
    final h = header(doc);
    if (h == null || _t(h['headerId']) != lama) return;
    h['headerId'] = baru;
    if (kode.isNotEmpty) h['kodeHeader'] = kode;
    h.remove(sinkron);
    h.remove(galat);
  }

  static void buang(Map<String, dynamic> doc, String id) {
    final h = header(doc);
    if (h != null && _t(h['headerId']) == id) {
      doc['header'] = null;
      doc['realisasi'] = <dynamic>[];
      return;
    }
    final real = _anak(doc, 'realisasi');
    real.removeWhere((r) => r is Map && _t(r['realisasiId']) == id);
    for (final r in real.whereType<Map<String, dynamic>>()) {
      _anak(r, 'temuan').removeWhere((t) => t is Map && _t(t['temuanId']) == id);
    }
  }

  // ---------- foto temuan ----------

  static bool tambahFoto(Map<String, dynamic> doc, String temuanId, String slot, String path) {
    final t = temuan(doc, temuanId);
    if (t == null) return false;
    HartekLokal.tambahFotoNode(t, slot, path);
    return true;
  }

  static void tandaiFoto(Map<String, dynamic> doc, String temuanId, String slot, String? status, {String? pesan, String? link}) {
    final t = temuan(doc, temuanId);
    if (t != null) HartekLokal.tandaiFotoNode(t, slot, status, pesan: pesan, link: link);
  }

  static String? buangFoto(Map<String, dynamic> doc, String temuanId, String slot) {
    final t = temuan(doc, temuanId);
    return t == null ? null : HartekLokal.buangFotoNode(t, slot);
  }

  // ---------- hitung ----------

  static ({int menunggu, int gagal}) hitung(Map<String, dynamic>? doc) {
    var m = 0, g = 0;
    void cek(Map<String, dynamic> n) {
      if (n[sinkron] == lokal) m++;
      if (n[sinkron] == gagal) g++;
      if (n[ubah] == lokal) m++;
      if (n[ubah] == gagal) g++;
      final f = HartekLokal.hitungFotoNode(n);
      m += f.menunggu;
      g += f.gagal;
    }

    if (doc == null) return (menunggu: 0, gagal: 0);
    final h = header(doc);
    if (h != null) cek(h);
    for (final r in daftar(doc['realisasi'])) {
      cek(r);
      daftar(r['temuan']).forEach(cek);
    }
    return (menunggu: m, gagal: g);
  }

  /// v1.0.2: jumlah temuan yang foto temuan / tiangnya belum ada (tidak di HP, tidak di server).
  static int temuanFotoKurang(Map<String, dynamic>? doc) => doc == null
      ? 0
      : daftar(doc['realisasi']).fold<int>(
          0, (a, r) => a + daftar(r['temuan']).where((t) => HartekLokal.fotoKurang(slotFoto, t).isNotEmpty).length);

  static int jumlahTemuan(Map<String, dynamic>? doc) =>
      doc == null ? 0 : daftar(doc['realisasi']).fold<int>(0, (a, r) => a + daftar(r['temuan']).length);

  static int totalTiang(Map<String, dynamic>? doc) => doc == null
      ? 0
      : daftar(doc['realisasi']).fold<int>(0, (a, r) => a + (num.tryParse(_t(r['totalTiang']))?.round() ?? 0));

  // ---------- gabung dengan server ----------

  static const _isianHeader = [
    'koordinatAwal', 'koordinatAkhir', 'kmAwal', 'kmAkhir', 'kendala', '_akurasi_koordinatAwal', '_akurasi_koordinatAkhir'
  ];
  static const _isianRealisasi = ['tier', 'section', 'totalTiang']; // v1.0.5: satu section, tanpa segmen

  /// Server menang untuk data yang sudah diterimanya; node lokal bertanda tetap di bawah induknya (dicocokkan per ID).
  static Map<String, dynamic> gabung(Map<String, dynamic> lokalDoc, Map<String, dynamic> server) {
    final hLokal = header(lokalDoc);
    final hServer = server['header'] is Map ? (server['header'] as Map).cast<String, dynamic>() : null;
    final tanda = hitung(lokalDoc);
    final punyaTanda = tanda.menunggu + tanda.gagal > 0;
    final tanggal = _t(server['tanggal']).isNotEmpty ? _t(server['tanggal']) : _t(lokalDoc['tanggal']);
    if (hLokal != null && tertunda(hLokal)) return salin(lokalDoc);
    if (hServer == null) return punyaTanda && hLokal != null ? salin(lokalDoc) : kosong(tanggal);
    if (hLokal != null && _t(hLokal['headerId']) != _t(hServer['headerId']) && punyaTanda) return salin(lokalDoc);
    final hasil = salin({'tanggal': tanggal, 'header': hServer, 'realisasi': server['realisasi'] ?? <dynamic>[]});
    final h = hasil['header'] as Map<String, dynamic>;
    if (hLokal != null) {
      for (final k in const ['koordinatAwal', 'koordinatAkhir']) {
        if (_t(hLokal[k]).isNotEmpty && _t(hLokal[k]) == _t(h[k]) && hLokal['_akurasi_$k'] != null) {
          h['_akurasi_$k'] = hLokal['_akurasi_$k'];
        }
      }
      if (hLokal[ubah] != null) {
        for (final k in _isianHeader) {
          if (hLokal.containsKey(k)) h[k] = hLokal[k];
        }
        h[ubah] = hLokal[ubah];
        if (hLokal[galatUbah] != null) h[galatUbah] = hLokal[galatUbah];
      }
    }
    if (hLokal == null || _t(hLokal['headerId']) != _t(hServer['headerId'])) return hasil;
    final realS = daftar(hasil['realisasi']);
    final out = <dynamic>[...realS];
    for (final l in daftar(lokalDoc['realisasi'])) {
      final s = realS.where((x) => _t(x['realisasiId']) == _t(l['realisasiId'])).firstOrNull;
      if (s == null) {
        if (tertunda(l)) out.add(salin(l));
        continue;
      }
      if (l[ubah] != null) {
        for (final k in _isianRealisasi) {
          if (l.containsKey(k)) s[k] = l[k];
        }
        s[ubah] = l[ubah];
        if (l[galatUbah] != null) s[galatUbah] = l[galatUbah];
      }
      final temS = daftar(s['temuan']);
      final temOut = <dynamic>[...temS];
      for (final lt in daftar(l['temuan'])) {
        final st = temS.where((x) => _t(x['temuanId']) == _t(lt['temuanId'])).firstOrNull;
        if (st == null) {
          if (tertunda(lt) || HartekLokal.punyaFotoTertunda(lt)) temOut.add(salin(lt));
          continue;
        }
        // v1.0.5: perubahan temuan yang belum diterima server tetap tampil
        if (lt[ubah] != null) {
          for (final k in isianTemuan) {
            if (lt.containsKey(k)) st[k] = lt[k];
          }
          st[ubah] = lt[ubah];
          if (lt[galatUbah] != null) st[galatUbah] = lt[galatUbah];
        }
        HartekLokal.bawaFotoLokal(lt, st);
      }
      s['temuan'] = temOut;
    }
    hasil['realisasi'] = out;
    return hasil;
  }
}

/// v1.0.6 (Master Guswan 20 Okt 2026): teks WA Inspeksi Jaringan per tier. Penyulang yang sama digabung (1 blok), di dalamnya
/// tiap section: Section, Temuan (per jenis, jumlah titik), dan Jumlah Tiang. Di akhir tiap penyulang: total tiang tier.
String waTeksInsJar({required String tanggalTampil, required Map<String, dynamic> header, required List<Map<String, dynamic>> realisasi}) {
  String t(Object? v) => v?.toString().trim() ?? '';
  String strip(Object? v) => t(v).isEmpty ? '-' : t(v);
  final urutTier = <String>[];
  final perTier = <String, List<Map<String, dynamic>>>{};
  for (final r in realisasi) {
    final k = t(r['tier']).isEmpty ? '-' : t(r['tier']);
    if (!perTier.containsKey(k)) urutTier.add(k);
    perTier.putIfAbsent(k, () => []).add(r);
  }
  urutTier.sort();
  const garis = '—————————————————————';
  final b = <String>[
    '*Realisasi Inspeksi Jaringan*',
    '-' * 67,
    'Hari / Tanggal : $tanggalTampil',
    'Koordinat Awal : ${strip(header['koordinatAwal'])}',
    'Koordinat Akhir : ${strip(header['koordinatAkhir'])}',
    'Stand KM Awal / Akhir : ${strip(header['kmAwal'])} / ${strip(header['kmAkhir'])}',
    '',
  ];
  var total = 0;
  for (final tier in urutTier) {
    final grup = perTier[tier]!;
    b
      ..add(garis)
      ..add('—- Inspeksi *$tier* —-');
    // penyulang urut kemunculan, semua section-nya digabung di satu blok
    final urutPen = <String>[];
    final perPen = <String, List<Map<String, dynamic>>>{};
    for (final r in grup) {
      final p = t(r['penyulang']).isEmpty ? '-' : t(r['penyulang']);
      if (!perPen.containsKey(p)) urutPen.add(p);
      perPen.putIfAbsent(p, () => []).add(r);
    }
    var tiangTier = 0;
    for (var i = 0; i < urutPen.length; i++) {
      final pen = urutPen[i];
      b.add('${i + 1}. Penyulang *$pen*');
      var tiangPen = 0;
      for (final r in perPen[pen]!) {
        final tiang = num.tryParse(t(r['totalTiang']))?.round() ?? 0;
        tiangPen += tiang;
        b
          ..add('Section : ${strip(r['section'])}')
          ..add('Temuan :');
        final urut = <String>[];
        final hitung = <String, int>{};
        for (final tm in HartekLokal.daftar(r['temuan'])) {
          final j = t(tm['jenisTemuan']);
          if (j.isEmpty) continue;
          if (!hitung.containsKey(j)) urut.add(j);
          hitung[j] = (hitung[j] ?? 0) + 1;
        }
        if (urut.isEmpty) {
          b.add('- Nihil');
        } else {
          for (final j in urut) {
            b.add('- $j : ${hitung[j]} Titik');
          }
        }
        b
          ..add('Jumlah Tiang yang di Inspeksi : *$tiang Tiang*')
          ..add('');
      }
      b
        ..add('Total Tiang yang di Inspeksi $tier Penyulang *$pen* : *$tiangPen Tiang*')
        ..add('');
      tiangTier += tiangPen;
      total += tiangPen;
    }
    b
      ..add('${tier == '-' ? 'Total Tiang yang di Inspeksi' : 'Total Tiang yang di Inspeksi $tier'} : *$tiangTier Tiang*')
      ..add('');
  }
  if (urutTier.length > 1) {
    final gabung = urutTier.length == 2
        ? '${urutTier[0]} dan ${urutTier[1]}'
        : '${urutTier.sublist(0, urutTier.length - 1).join(', ')} dan ${urutTier.last}';
    b
      ..add(garis)
      ..add('Total Tiang hasil Inspeksi $gabung : *$total Tiang*');
  }
  return b.join('\n').replaceFirst(RegExp(r'\n+$'), '');
}
