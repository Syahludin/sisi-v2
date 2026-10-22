import 'dart:convert';

import '../hartek/hartek_lokal.dart';
import 'insdu_bantu.dart';

/// v1.0.12 (permintaan kvlar 21 Okt 2026): Inspeksi Gardu offline (pola InsJarLokal / HartekLokal).
///
/// Logika murni dokumen laporan harian di HP (tanpa sqflite / jaringan, diuji di insdu_lokal_test.dart).
/// Bentuk dokumen = jawaban getInsDuHarian + penanda `jenis: INSDU`:
///   `{jenis, tanggal, header, realisasi: [gardu {pengukuran {lwbp, wbp, cover, catatan}, temuan[], temuanTertinggal[]}],
///     tunggakan: {headerId, kodeHeader, tanggal, realisasi: [{realisasiId, kodeRealisasi, noGardu, pengukuran?}]} | null}`.
/// Tanda kirim: `_sinkron` / `_galat` (pembuatan header / gardu / temuan), `_ubah` / `_galatUbah` (ubah header / temuan),
/// foto temuan seperti InsJar, dan pengukuran per periode di node gardu: `_ukur_LWBP` / `_galatUkur_LWBP` (WBP sama),
/// `_asliUkur_LWBP` = nilai server sebelum diubah di HP (dipulihkan kalau perubahan ditolak lalu dibuang).
class InsDuLokal {
  InsDuLokal._();

  static const jenisDoc = 'INSDU';
  static const lokal = HartekLokal.lokal, gagal = HartekLokal.gagal;
  static const sinkron = HartekLokal.sinkron, galat = HartekLokal.galat, ubah = HartekLokal.ubah, galatUbah = HartekLokal.galatUbah;

  static const slotFoto = ['TEMUAN', 'TIANG'];
  static const labelFoto = {'TEMUAN': 'Foto temuan', 'TIANG': 'Foto gardu'};
  static const periode = ['LWBP', 'WBP'];

  static const endpoint = {
    'buatHeader': 'buatHeaderInsDu',
    'ubahHeader': 'ubahHeaderInsDu',
    'simpanRealisasi': 'simpanRealisasiInsDu',
    'ubahRealisasi': 'ubahRealisasiInsDu', // v1.0.14: ubah gardu / tier
    'simpanUkur': 'simpanPengukuranInsDu', // target = '<realisasiId>#<PERIODE>'
    'simpanTemuan': 'simpanTemuanInsDu',
    'ubahTemuan': 'ubahTemuanInsDu',
    'uploadFoto': 'uploadFotoInsDu', // target = '<temuanId>#<SLOT>'
  };

  static const kodeAksi = {'buatHeader': 'kodeHeader', 'simpanRealisasi': 'kodeRealisasi', 'simpanTemuan': 'kodeTemuan'};

  static const isianTemuan = ['tierInspeksi', 'jenisTemuan', 'jenisTemuanId', 'deskripsi', 'koordinat'];

  static String kunciUkur(String p) => '_ukur_$p';
  static String kunciGalatUkur(String p) => '_galatUkur_$p';
  static String kunciAsliUkur(String p) => '_asliUkur_$p';

  static Map<String, dynamic> kosong(String tanggal) =>
      {'jenis': jenisDoc, 'tanggal': tanggal, 'header': null, 'realisasi': <dynamic>[], 'tunggakan': null};

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
  static String targetUkur(String realisasiId, String p) => '$realisasiId#$p';

  static String? induk(String aksi, Map<String, dynamic> data) {
    switch (aksi) {
      case 'ubahHeader':
      case 'simpanRealisasi':
        return _t(data['headerId']);
      case 'ubahRealisasi':
      case 'simpanUkur':
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
  static bool aksiUbah(String aksi) => aksi == 'ubahHeader' || aksi == 'ubahRealisasi' || aksi == 'ubahTemuan';

  /// v1.0.14: isian gardu yang ikut berubah saat gardu / tier diubah.
  static const isianRealisasi = ['garduId', 'noGardu', 'penyulang', 'section', 'alamat', 'kapasitasKva', 'merkTrafo', 'tier'];

  // ---------- cari ----------

  static Map<String, dynamic>? header(Map<String, dynamic> doc) =>
      doc['header'] is Map<String, dynamic> ? doc['header'] as Map<String, dynamic> : null;

  static Map<String, dynamic>? tunggakan(Map<String, dynamic> doc) =>
      doc['tunggakan'] is Map<String, dynamic> ? doc['tunggakan'] as Map<String, dynamic> : null;

  static Map<String, dynamic>? realisasi(Map<String, dynamic> doc, String realisasiId) {
    for (final r in daftar(doc['realisasi'])) {
      if (_t(r['realisasiId']) == realisasiId) return r;
    }
    return null;
  }

  /// Gardu hari ini ATAU gardu tunggakan WBP laporan sebelumnya (tempat pengukuran).
  static Map<String, dynamic>? garduUkur(Map<String, dynamic> doc, String realisasiId) {
    final r = realisasi(doc, realisasiId);
    if (r != null) return r;
    for (final x in daftar(tunggakan(doc)?['realisasi'])) {
      if (_t(x['realisasiId']) == realisasiId) return x;
    }
    return null;
  }

  static bool garduTunggakan(Map<String, dynamic> doc, String realisasiId) =>
      realisasi(doc, realisasiId) == null && garduUkur(doc, realisasiId) != null;

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

  static List<String> idTurunan(Map<String, dynamic> doc, String id) {
    final h = header(doc);
    List<String> dariReal(Map<String, dynamic> r) => [_t(r['realisasiId']), for (final t in daftar(r['temuan'])) _t(t['temuanId'])];
    if (h != null && _t(h['headerId']) == id) return [id, for (final r in daftar(doc['realisasi'])) ...dariReal(r)];
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
    h.addAll(isian);
    if (tandaiUbah) {
      h[ubah] = lokal;
      h.remove(galatUbah);
    }
  }

  static void tambahRealisasi(Map<String, dynamic> doc, Map<String, dynamic> node) {
    final r = <String, dynamic>{
      'pengukuran': null,
      'temuanTertinggal': <dynamic>[],
      ...node,
      'temuan': <dynamic>[],
      sinkron: lokal,
    };
    _statusUkur(r);
    _anak(doc, 'realisasi').add(r);
  }

  /// v1.0.14: ubah gardu / tier di HP. [isian] = kunci [isianRealisasi].
  static bool ubahIsianRealisasi(Map<String, dynamic> doc, String realisasiId, Map<String, dynamic> isian, {required bool tandaiUbah}) {
    final r = realisasi(doc, realisasiId);
    if (r == null) return false;
    for (final k in isianRealisasi) {
      if (isian.containsKey(k)) r[k] = isian[k];
    }
    _statusUkur(r);
    if (tandaiUbah) {
      r[ubah] = lokal;
      r.remove(galatUbah);
    }
    return true;
  }

  /// v1.0.14: alasan gardu / tier tidak boleh diubah (null = boleh). Sama dengan aturan ubahRealisasiInsDu server.
  static String? kunciUbahGardu(Map<String, dynamic> r, {required String tierBaru, required bool gantiGardu}) {
    final pk = r['pengukuran'] is Map ? r['pengukuran'] as Map : const {};
    final adaUkur = pk['lwbp'] != null || pk['wbp'] != null;
    final daftarTier = tierDaftarInsDu(tierBaru);
    if (adaUkur && !daftarTier.contains('Tier 1')) return 'TIER_TERKUNCI';
    for (final t in daftar(r['temuan'])) {
      final ti = _t(t['tierInspeksi']);
      if (ti.isNotEmpty && !daftarTier.contains(ti)) return 'TIER_TERKUNCI';
    }
    if (gantiGardu && (adaUkur || daftar(r['temuan']).isNotEmpty)) return 'GARDU_TERKUNCI';
    return null;
  }

  /// Gardu yang sama tidak boleh dua kali di satu laporan (GARDU_GANDA server).
  static bool garduGanda(Map<String, dynamic> doc, String garduId) =>
      daftar(doc['realisasi']).any((r) => _t(r['garduId']) == garduId.trim());

  /// Pengukuran satu periode ditulis di HP. [nilai] = 10 nilai ukur (angka), [cover] hanya LWBP.
  /// Hasil hitung (kVA, %, kategori) memakai rumus server supaya tampilan langsung sama.
  static bool simpanUkur(Map<String, dynamic> doc, String realisasiId, String p, Map<String, num> nilai,
      {Map<String, String> cover = const {}, String? catatan, required String waktu}) {
    final r = garduUkur(doc, realisasiId);
    if (r == null) return false;
    final pk = r['pengukuran'] is Map<String, dynamic>
        ? r['pengukuran'] as Map<String, dynamic>
        : <String, dynamic>{'lwbp': null, 'wbp': null, 'cover': <String, dynamic>{}, 'catatan': ''};
    final k = p.toLowerCase();
    if (r[kunciUkur(p)] == null) {
      r[kunciAsliUkur(p)] = {k: pk[k], if (p == 'LWBP') 'cover': pk['cover'], 'catatan': pk['catatan']};
    }
    final h = hitungUkurInsDu(nilai, angkaInsDu(r['kapasitasKva']));
    pk[k] = {
      'waktu': waktu,
      ...nilai,
      'kva': h.kva,
      'persen': h.persen,
      'kategori': h.kategori,
      'tidakSeimbang': h.tidakSeimbang,
    };
    if (p == 'LWBP') pk['cover'] = {...cover};
    if (catatan != null) pk['catatan'] = catatan;
    r['pengukuran'] = pk;
    r[kunciUkur(p)] = lokal;
    r.remove(kunciGalatUkur(p));
    _statusUkur(r);
    return true;
  }

  static void _statusUkur(Map<String, dynamic> r) {
    final pk = r['pengukuran'] is Map ? r['pengukuran'] as Map : const {};
    final l = pk['lwbp'] != null, w = pk['wbp'] != null;
    // v1.0.14: Tier 2 saja = tanpa pengukuran, langsung masuk laporan
    final perlu = perluUkurInsDu(r['tier']);
    r['perluUkur'] = perlu;
    r['statusUkur'] = !perlu ? 'TANPA_UKUR' : l && w ? 'LENGKAP' : l ? 'LWBP' : 'BELUM';
    r['masukLaporan'] = !perlu || l;
  }

  /// Tanda pengukuran per periode. null = diterima server.
  static void tandaiUkur(Map<String, dynamic> doc, String realisasiId, String p, String? status, {String? pesan}) {
    final r = garduUkur(doc, realisasiId);
    if (r == null) return;
    if (status == null) {
      r
        ..remove(kunciUkur(p))
        ..remove(kunciGalatUkur(p))
        ..remove(kunciAsliUkur(p));
      return;
    }
    r[kunciUkur(p)] = status;
    if (pesan == null) {
      r.remove(kunciGalatUkur(p));
    } else {
      r[kunciGalatUkur(p)] = pesan;
    }
  }

  /// Jawaban simpanPengukuranInsDu: periode itu diganti nilai server (periode lain yang masih menunggu tidak disentuh).
  static void ukurDiterima(Map<String, dynamic> doc, String realisasiId, String p, Map<String, dynamic> hasil) {
    final r = garduUkur(doc, realisasiId);
    if (r == null) return;
    final srv = hasil['pengukuran'] is Map ? Map<String, dynamic>.from(hasil['pengukuran'] as Map) : null;
    if (srv != null) {
      final pk = r['pengukuran'] is Map<String, dynamic> ? r['pengukuran'] as Map<String, dynamic> : <String, dynamic>{};
      final k = p.toLowerCase();
      pk[k] = srv[k];
      if (p == 'LWBP') pk['cover'] = srv['cover'];
      pk['catatan'] = srv['catatan'];
      for (final x in const ['pengukuranId', 'kodePengukuran', 'revision']) {
        if (srv[x] != null) pk[x] = srv[x];
      }
      r['pengukuran'] = pk;
    }
    tandaiUkur(doc, realisasiId, p, null);
    _statusUkur(r);
  }

  /// Buang pengukuran yang ditolak: nilai server sebelumnya dipulihkan.
  static void buangUkur(Map<String, dynamic> doc, String realisasiId, String p) {
    final r = garduUkur(doc, realisasiId);
    if (r == null) return;
    final asli = r[kunciAsliUkur(p)];
    if (asli is Map && r['pengukuran'] is Map<String, dynamic>) {
      final pk = r['pengukuran'] as Map<String, dynamic>;
      for (final e in asli.entries) {
        pk['${e.key}'] = e.value;
      }
    }
    tandaiUkur(doc, realisasiId, p, null);
    _statusUkur(r);
  }

  static bool tambahTemuan(Map<String, dynamic> doc, String realisasiId, Map<String, dynamic> node) {
    final r = realisasi(doc, realisasiId);
    if (r == null) return false;
    _anak(r, 'temuan').add({...node, sinkron: lokal});
    return true;
  }

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

  static void diterima(Map<String, dynamic> doc, String aksi, String id, Map<String, dynamic> hasil) {
    final n = cari(doc, id);
    if (n == null) return;
    final kolom = kodeAksi[aksi];
    if (kolom != null && _t(hasil[kolom]).isNotEmpty) n[kolom] = _t(hasil[kolom]);
    if (aksi == 'simpanRealisasi' && hasil['temuanTertinggal'] is List) n['temuanTertinggal'] = hasil['temuanTertinggal'];
    if (aksi == 'simpanTemuan' && hasil['revision'] is num) n['revision'] = hasil['revision'];
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
      for (final k in [sinkron, ubah, kunciUkur('LWBP'), kunciUkur('WBP')]) {
        if (n[k] == lokal) m++;
        if (n[k] == gagal) g++;
      }
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
    daftar(tunggakan(doc)?['realisasi']).forEach(cek);
    return (menunggu: m, gagal: g);
  }

  /// Gardu tunggakan yang WBP-nya belum ada (di server maupun di HP). Kosong = boleh buat Laporan Utama baru.
  /// v1.0.16: termasuk gardu yang LWBP-nya juga belum ada (kurang = LWBP); dua-duanya diisi susulan.
  static List<Map<String, dynamic>> tunggakanTerbuka(Map<String, dynamic> doc) => [
        for (final r in daftar(tunggakan(doc)?['realisasi']))
          if ((r['pengukuran'] is! Map || (r['pengukuran'] as Map)['wbp'] == null) && r[kunciUkur('WBP')] == null) r,
      ];

  // ---------- gabung dengan server ----------

  static const _isianHeader = ['koordinatAwal', 'koordinatAkhir', 'kmAwal', 'kmAkhir', 'kendala'];

  /// Bawa pengukuran HP yang belum diterima server ke node server (periode bertanda saja).
  static void _bawaUkur(Map<String, dynamic> dariHp, Map<String, dynamic> keServer) {
    var ada = false;
    for (final p in periode) {
      if (dariHp[kunciUkur(p)] == null) continue;
      ada = true;
      final pkH = dariHp['pengukuran'] is Map ? Map<String, dynamic>.from(dariHp['pengukuran'] as Map) : <String, dynamic>{};
      final pkS = keServer['pengukuran'] is Map<String, dynamic>
          ? keServer['pengukuran'] as Map<String, dynamic>
          : <String, dynamic>{'lwbp': null, 'wbp': null, 'cover': <String, dynamic>{}, 'catatan': ''};
      final k = p.toLowerCase();
      pkS[k] = pkH[k];
      if (p == 'LWBP') pkS['cover'] = pkH['cover'];
      pkS['catatan'] = pkH['catatan'];
      keServer['pengukuran'] = pkS;
      for (final x in [kunciUkur(p), kunciGalatUkur(p), kunciAsliUkur(p)]) {
        if (dariHp[x] != null) keServer[x] = dariHp[x];
      }
    }
    if (ada) _statusUkur(keServer);
  }

  static Map<String, dynamic>? _gabungTunggakan(Map<String, dynamic>? lokalT, Map<String, dynamic>? serverT) {
    final hasil = serverT == null ? null : salin(serverT);
    final tertunda = [
      for (final r in daftar(lokalT?['realisasi']))
        if (r[kunciUkur('WBP')] != null || r[kunciUkur('LWBP')] != null) r, // v1.0.16: + LWBP susulan
    ];
    if (tertunda.isEmpty) return hasil;
    final out = hasil ?? {...salin(lokalT!), 'realisasi': <dynamic>[]};
    final daftarOut = _anak(out, 'realisasi');
    for (final l in tertunda) {
      final s = daftar(daftarOut).where((x) => _t(x['realisasiId']) == _t(l['realisasiId'])).firstOrNull;
      if (s == null) {
        daftarOut.add(salin(l));
      } else {
        _bawaUkur(l, s);
      }
    }
    return out;
  }

  /// Server menang untuk data yang sudah diterimanya; node / pengukuran / foto lokal bertanda tetap tampil.
  static Map<String, dynamic> gabung(Map<String, dynamic> lokalDoc, Map<String, dynamic> server) {
    final hLokal = header(lokalDoc);
    final hServer = server['header'] is Map ? (server['header'] as Map).cast<String, dynamic>() : null;
    final tanda = hitung(lokalDoc);
    final punyaTanda = tanda.menunggu + tanda.gagal > 0;
    final tanggal = _t(server['tanggal']).isNotEmpty ? _t(server['tanggal']) : _t(lokalDoc['tanggal']);
    final tung = _gabungTunggakan(tunggakan(lokalDoc), server['tunggakan'] is Map ? (server['tunggakan'] as Map).cast<String, dynamic>() : null);
    if (hLokal != null && tertunda(hLokal)) return {...salin(lokalDoc), 'tunggakan': tung};
    if (hServer == null) {
      return punyaTanda && hLokal != null ? {...salin(lokalDoc), 'tunggakan': tung} : {...kosong(tanggal), 'tunggakan': tung};
    }
    if (hLokal != null && _t(hLokal['headerId']) != _t(hServer['headerId']) && punyaTanda) return {...salin(lokalDoc), 'tunggakan': tung};
    final hasil = salin({'jenis': jenisDoc, 'tanggal': tanggal, 'header': hServer, 'realisasi': server['realisasi'] ?? <dynamic>[], 'tunggakan': tung});
    final h = hasil['header'] as Map<String, dynamic>;
    if (hLokal != null && hLokal[ubah] != null) {
      for (final k in _isianHeader) {
        if (hLokal.containsKey(k)) h[k] = hLokal[k];
      }
      h[ubah] = hLokal[ubah];
      if (hLokal[galatUbah] != null) h[galatUbah] = hLokal[galatUbah];
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
      // v1.0.14: perubahan gardu / tier yang belum diterima server tetap tampil
      if (l[ubah] != null) {
        for (final k in isianRealisasi) {
          if (l.containsKey(k)) s[k] = l[k];
        }
        s[ubah] = l[ubah];
        if (l[galatUbah] != null) s[galatUbah] = l[galatUbah];
        _statusUkur(s);
      }
      _bawaUkur(l, s);
      final temS = daftar(s['temuan']);
      final temOut = <dynamic>[...temS];
      for (final lt in daftar(l['temuan'])) {
        final st = temS.where((x) => _t(x['temuanId']) == _t(lt['temuanId'])).firstOrNull;
        if (st == null) {
          if (tertunda(lt) || HartekLokal.punyaFotoTertunda(lt)) temOut.add(salin(lt));
          continue;
        }
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
