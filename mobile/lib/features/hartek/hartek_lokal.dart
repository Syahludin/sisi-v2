import 'dart:convert';

import 'hartek_repository.dart';

/// v0.95.0 (permintaan Master Guswan 14 Okt 2026): input Hartek lokal + kirim otomatis.
///
/// Logika murni dokumen laporan harian di HP (tanpa sqflite / jaringan, diuji di hartek_lokal_test.dart).
/// Bentuk dokumen sama dengan jawaban getHartekHarian: `{tanggal, header, objek: [pg {pekerjaan: [pk {material,
/// grounding, pemerataan}]}]}`. Data yang belum diterima server ditandai per node:
///   `_sinkron` = LOKAL (menunggu kirim) | GAGAL (ditolak server, `_galat` = alasannya)
///   header juga punya `_ubah` / `_galatUbah` untuk perubahan Laporan Utama yang belum terkirim.
/// ID dibuat HP (UUID) dan dikirim sebagai headerId / idBaris, jadi kiriman ulang tidak membuat baris dobel.
class HartekLokal {
  HartekLokal._();

  static const lokal = 'LOKAL', gagal = 'GAGAL';

  /// `_sinkron` / `_galat` = pembuatan node. `_ubah` / `_galatUbah` = PERUBAHAN node yang sudah ada di server
  /// (Laporan Utama sejak v0.95.0, jumlah pekerjaan sejak v0.97.0): node tetap milik server, hanya isiannya menunggu.
  static const sinkron = '_sinkron', galat = '_galat', ubah = '_ubah', galatUbah = '_galatUbah';

  /// v1.0.0: foto rincian (grounding / pemerataan). `fotoLokal` = {SLOT: path file di HP}, `_fotoSinkron` = {SLOT:
  /// LOKAL | GAGAL} untuk foto yang belum diterima server, `_fotoGalat` = {SLOT: alasan}. `foto` = {SLOT: link Drive}
  /// dari server (getHartekHarian).
  static const fotoLokal = 'fotoLokal', fotoSinkron = '_fotoSinkron', fotoGalat = '_fotoGalat', fotoServer = 'foto';

  /// Slot foto per jenis rincian (sama dengan HARTEK_FOTO_ server), urut tampil.
  static const slotFoto = {
    'grounding': ['SEBELUM', 'SESUDAH'],
    // v1.0.41: arus per fasa, tanpa tegangan
    'pemerataan': ['ARUS_R_SEBELUM', 'ARUS_S_SEBELUM', 'ARUS_T_SEBELUM', 'ARUS_R_SESUDAH', 'ARUS_S_SESUDAH', 'ARUS_T_SESUDAH'],
  };
  static const labelFoto = {
    'SEBELUM': 'Foto sebelum',
    'SESUDAH': 'Foto sesudah',
    'ARUS_R_SEBELUM': 'Foto arus R sebelum',
    'ARUS_S_SEBELUM': 'Foto arus S sebelum',
    'ARUS_T_SEBELUM': 'Foto arus T sebelum',
    'ARUS_R_SESUDAH': 'Foto arus R sesudah',
    'ARUS_S_SESUDAH': 'Foto arus S sesudah',
    'ARUS_T_SESUDAH': 'Foto arus T sesudah',
  };

  /// Anak tiap pekerjaan beserta aksi server-nya.
  static const anakPekerjaan = {'material': 'simpanMaterial', 'grounding': 'simpanGrounding', 'pemerataan': 'simpanPemerataan'};

  /// Kolom kode hasil server per aksi.
  static const kodeAksi = {
    'buatHeader': 'kodeHeader',
    'simpanPg': 'kodePg',
    'simpanPekerjaan': 'kodePekerjaan',
    'simpanMaterial': 'kodeMaterial',
    'simpanGrounding': 'kodeGrounding',
    'simpanPemerataan': 'kodePemerataan',
  };

  /// Endpoint server per aksi antrean.
  static const endpoint = {
    'buatHeader': 'buatHeaderHartek',
    'ubahHeader': 'ubahHeaderHartek',
    'simpanPg': 'simpanPgHartek',
    'simpanPekerjaan': 'simpanPekerjaanHartek',
    'ubahPekerjaan': 'ubahPekerjaanHartek',
    'simpanMaterial': 'simpanMaterialHartek',
    'simpanGrounding': 'simpanGroundingHartek',
    'simpanPemerataan': 'simpanPemerataanHartek',
    'uploadFoto': 'uploadFotoHartek', // v1.0.0: target = '<idBaris>#<SLOT>'
  };

  static Map<String, dynamic> kosong(String tanggal) => {'tanggal': tanggal, 'header': null, 'objek': <dynamic>[]};

  /// Salinan dalam (dokumen tidak pernah diubah di tempat: layar bisa masih memegang versi lama).
  static Map<String, dynamic> salin(Map<String, dynamic> m) => Map<String, dynamic>.from(jsonDecode(jsonEncode(m)) as Map);

  static String _t(Object? v) => v?.toString().trim() ?? '';

  static Object? salinNilai(Object? v) => v == null ? null : jsonDecode(jsonEncode(v));

  static List<Map<String, dynamic>> daftar(Object? v) =>
      v is List ? v.whereType<Map<dynamic, dynamic>>().map((m) => m.cast<String, dynamic>()).toList() : <Map<String, dynamic>>[];

  /// List anak sebagai list yang bisa diubah (dibuat kalau belum ada).
  static List<dynamic> _anak(Map<String, dynamic> node, String kunci) {
    final v = node[kunci];
    if (v is List) return v;
    final baru = <dynamic>[];
    node[kunci] = baru;
    return baru;
  }

  static bool tertunda(Map<String, dynamic>? n) => n != null && n[sinkron] != null;

  /// Induk node yang dibuat aksi ini (null = header). ubahHeader menempel ke header.
  static String? induk(String aksi, Map<String, dynamic> data) {
    switch (aksi) {
      case 'buatHeader':
        return null;
      case 'ubahHeader':
      case 'simpanPg':
        return _t(data['headerId']);
      case 'simpanPekerjaan':
        return _t(data['pgId']);
      case 'ubahPekerjaan':
        return _t(data['pekerjaanId']);
      case 'uploadFoto':
        return _t(data['idBaris']);
      default:
        return _t(data['pekerjaanId']);
    }
  }

  /// Aksi yang MEMBUAT node (anaknya ikut terblokir kalau gagal). Aksi ubah hanya mengubah isian node yang sudah ada.
  static bool aksiBuat(String aksi) => aksi != 'ubahHeader' && aksi != 'ubahPekerjaan' && aksi != 'uploadFoto';

  /// Target antrean foto.
  static String targetFoto(String idBaris, String slot) => '$idBaris#$slot';

  // ---------- foto (v1.0.0) ----------

  static Map<String, String> _petaTeks(Object? v) =>
      v is Map ? {for (final e in v.entries) '${e.key}': _t(e.value)} : <String, String>{};

  /// Foto lokal di HP per slot. v1.0.24: path kosong = tidak ada.
  static Map<String, String> fotoDiHp(Map<String, dynamic> n) => _petaTeks(n[fotoLokal])..removeWhere((_, v) => v.isEmpty);

  /// Link Drive per slot (sudah diterima server). v1.0.24: link kosong = slot belum diisi (server WO mengirim semua slot,
  /// yang kosong ''); dulu dianggap sudah di server sehingga foto Pekerjaan / Sesudah tidak bisa diambil lagi.
  static Map<String, String> fotoDiServer(Map<String, dynamic> n) => _petaTeks(n[fotoServer])..removeWhere((_, v) => v.isEmpty);

  /// Status foto slot: null = sudah di server / belum ada, LOKAL = menunggu kirim, GAGAL = ditolak server.
  static String? statusFoto(Map<String, dynamic> n, String slot) {
    final v = _petaTeks(n[fotoSinkron])[slot];
    return v == null || v.isEmpty ? null : v;
  }

  static String? galatFoto(Map<String, dynamic> n, String slot) {
    final v = _petaTeks(n[fotoGalat])[slot];
    return v == null || v.isEmpty ? null : v;
  }

  /// Catat foto baru (menunggu kirim) di node rincian. false = node tidak ada.
  static bool tambahFoto(Map<String, dynamic> doc, String idBaris, String slot, String path) {
    final n = cari(doc, idBaris);
    if (n == null) return false;
    tambahFotoNode(n, slot, path);
    return true;
  }

  /// Tandai status foto. null = diterima server ([link] = link Drive dari server, disimpan di `foto`).
  static void tandaiFoto(Map<String, dynamic> doc, String idBaris, String slot, String? status, {String? pesan, String? link}) {
    final n = cari(doc, idBaris);
    if (n != null) tandaiFotoNode(n, slot, status, pesan: pesan, link: link);
  }

  /// Foto yang belum diterima server dibuang dari node (file dihapus pemanggil). Hasil = path file.
  static String? buangFoto(Map<String, dynamic> doc, String idBaris, String slot) {
    final n = cari(doc, idBaris);
    return n == null ? null : buangFotoNode(n, slot);
  }

  // Versi per node: dipakai juga dokumen Inspeksi Jaringan (InsJarLokal) yang bentuk pohonnya beda.

  static void tambahFotoNode(Map<String, dynamic> n, String slot, String path) {
    n[fotoLokal] = {...fotoDiHp(n), slot: path};
    n[fotoSinkron] = {..._petaTeks(n[fotoSinkron]), slot: lokal};
    n[fotoGalat] = _petaTeks(n[fotoGalat])..remove(slot);
  }

  static void tandaiFotoNode(Map<String, dynamic> n, String slot, String? status, {String? pesan, String? link}) {
    final st = _petaTeks(n[fotoSinkron]), g = _petaTeks(n[fotoGalat]);
    if (status == null) {
      st.remove(slot);
      g.remove(slot);
      if (link != null && link.isNotEmpty) n[fotoServer] = {...fotoDiServer(n), slot: link};
    } else {
      st[slot] = status;
      if (pesan == null) {
        g.remove(slot);
      } else {
        g[slot] = pesan;
      }
    }
    n[fotoSinkron] = st;
    n[fotoGalat] = g;
  }

  static String? buangFotoNode(Map<String, dynamic> n, String slot) {
    final hp = fotoDiHp(n), st = _petaTeks(n[fotoSinkron]), g = _petaTeks(n[fotoGalat]);
    final path = hp.remove(slot);
    st.remove(slot);
    g.remove(slot);
    n[fotoLokal] = hp;
    n[fotoSinkron] = st;
    n[fotoGalat] = g;
    return path;
  }

  /// Jumlah foto (menunggu, gagal) satu node.
  static ({int menunggu, int gagal}) hitungFotoNode(Map<String, dynamic> n) {
    var m = 0, g = 0;
    for (final v in _petaTeks(n[fotoSinkron]).values) {
      if (v == lokal) m++;
      if (v == gagal) g++;
    }
    return (menunggu: m, gagal: g);
  }

  /// Salin data foto lokal (file + status) dari node HP ke node server saat gabung.
  static void bawaFotoLokal(Map<String, dynamic> dariHp, Map<String, dynamic> keServer) {
    for (final k in const [fotoLokal, fotoSinkron, fotoGalat]) {
      if (dariHp[k] != null) keServer[k] = salinNilai(dariHp[k]);
    }
  }

  static bool punyaFotoTertunda(Map<String, dynamic> n) => _petaTeks(n[fotoSinkron]).isNotEmpty;

  /// v1.0.2: slot foto wajib rincian ini (pasang grounding tanpa nilai sebelum = hanya SESUDAH).
  static List<String> slotWajib(String jenis, Map<String, dynamic> n) {
    final s = slotFoto[jenis] ?? const <String>[];
    if (jenis == 'grounding' && _t(n['hasilSebelum']).isEmpty) return s.where((x) => x != 'SEBELUM').toList();
    return s;
  }

  /// v1.0.2: slot wajib yang belum punya foto sama sekali (tidak di HP, tidak di server).
  static List<String> fotoKurang(List<String> slot, Map<String, dynamic> n) {
    final hp = fotoDiHp(n), srv = fotoDiServer(n);
    return [for (final s in slot) if ((hp[s] ?? '').isEmpty && (srv[s] ?? '').isEmpty) s];
  }

  /// v1.0.2: jumlah rincian grounding / pemerataan di dokumen yang fotonya belum lengkap.
  /// v1.0.38: pekerjaan di daftar wajib grounding (HartekRepository.groundingWajib) harus punya minimal satu hasil grounding.
  static bool groundingKurang(Map<String, dynamic> pk) =>
      HartekRepository.groundingWajib('${pk['pekerjaan'] ?? ''}') && daftar(pk['grounding']).isEmpty;

  /// v1.0.40: Pemerataan / Pembagian Beban Gardu wajib punya minimal satu hasil pemerataan beban.
  static bool pemerataanKurang(Map<String, dynamic> pk) =>
      HartekRepository.pemerataanBoleh('${pk['pekerjaan'] ?? ''}') && daftar(pk['pemerataan']).isEmpty;

  /// v1.0.40: pekerjaan yang hasil ukur wajibnya (grounding / pemerataan) belum diisi.
  static bool hasilKurang(Map<String, dynamic> pk) => groundingKurang(pk) || pemerataanKurang(pk);

  /// v1.0.38: jumlah pekerjaan di dokumen yang hasil ukur wajibnya belum diisi (v1.0.40: + pemerataan).
  static int pekerjaanHasilKurang(Map<String, dynamic>? doc) {
    if (doc == null) return 0;
    var n = 0;
    for (final p in daftar(doc['objek'])) {
      for (final k in daftar(p['pekerjaan'])) {
        if (hasilKurang(k)) n++;
      }
    }
    return n;
  }

  static int rincianFotoKurang(Map<String, dynamic>? doc) {
    if (doc == null) return 0;
    var n = 0;
    for (final p in daftar(doc['objek'])) {
      for (final k in daftar(p['pekerjaan'])) {
        for (final jenis in slotFoto.keys) {
          for (final a in daftar(k[jenis])) {
            if (fotoKurang(slotWajib(jenis, a), a).isNotEmpty) n++;
          }
        }
      }
    }
    return n;
  }

  // ---------- cari ----------

  static Map<String, dynamic>? pg(Map<String, dynamic> doc, String pgId) {
    for (final p in daftar(doc['objek'])) {
      if (_t(p['pgId']) == pgId) return p;
    }
    return null;
  }

  static Map<String, dynamic>? pekerjaan(Map<String, dynamic> doc, String pekerjaanId) {
    for (final p in daftar(doc['objek'])) {
      for (final k in daftar(p['pekerjaan'])) {
        if (_t(k['pekerjaanId']) == pekerjaanId) return k;
      }
    }
    return null;
  }

  /// Node dengan ID [id] di tingkat mana pun (header, PG, pekerjaan, material / grounding / pemerataan).
  static Map<String, dynamic>? cari(Map<String, dynamic> doc, String id) {
    final h = doc['header'];
    if (h is Map<String, dynamic> && _t(h['headerId']) == id) return h;
    for (final p in daftar(doc['objek'])) {
      if (_t(p['pgId']) == id) return p;
      for (final k in daftar(p['pekerjaan'])) {
        if (_t(k['pekerjaanId']) == id) return k;
        for (final jenis in anakPekerjaan.keys) {
          for (final a in daftar(k[jenis])) {
            if (_t(a['idBaris']) == id) return a;
          }
        }
      }
    }
    return null;
  }

  /// ID node + seluruh turunannya (dipakai saat membuang data yang ditolak).
  static List<String> idTurunan(Map<String, dynamic> doc, String id) {
    final hasil = <String>[];
    void anakPk(Map<String, dynamic> k) {
      hasil.add(_t(k['pekerjaanId']));
      for (final jenis in anakPekerjaan.keys) {
        for (final a in daftar(k[jenis])) {
          hasil.add(_t(a['idBaris']));
        }
      }
    }

    void anakPg(Map<String, dynamic> p) {
      hasil.add(_t(p['pgId']));
      for (final k in daftar(p['pekerjaan'])) {
        anakPk(k);
      }
    }

    final h = doc['header'];
    if (h is Map<String, dynamic> && _t(h['headerId']) == id) {
      hasil.add(id);
      for (final p in daftar(doc['objek'])) {
        anakPg(p);
      }
      return hasil;
    }
    for (final p in daftar(doc['objek'])) {
      if (_t(p['pgId']) == id) {
        anakPg(p);
        return hasil;
      }
      for (final k in daftar(p['pekerjaan'])) {
        if (_t(k['pekerjaanId']) == id) {
          anakPk(k);
          return hasil;
        }
      }
    }
    return cari(doc, id) == null ? hasil : [id];
  }

  // ---------- tulis lokal ----------

  static void buatHeader(Map<String, dynamic> doc, Map<String, dynamic> header) {
    doc['header'] = {...header, sinkron: lokal};
    doc['objek'] = <dynamic>[];
  }

  static void ubahIsianHeader(Map<String, dynamic> doc, Map<String, dynamic> isian, {required bool tandaiUbah}) {
    final h = doc['header'];
    if (h is! Map<String, dynamic>) return;
    if (isian.containsKey('koordinatAwal') && !isian.containsKey('_akurasi_koordinatAwal')) {
      h.remove('_akurasi_koordinatAwal');
    }
    if (isian.containsKey('koordinatAkhir') && !isian.containsKey('_akurasi_koordinatAkhir')) {
      h.remove('_akurasi_koordinatAkhir');
    }
    h.addAll(isian);
    if (tandaiUbah) {
      h[ubah] = lokal;
      h.remove(galatUbah);
    }
  }

  /// v0.97.0: ubah isian pekerjaan yang sudah tersimpan (hanya jumlah). [tandaiUbah] false = antrean "simpanPekerjaan"
  /// yang diperbaiki (node memang belum ada di server), jadi cukup tanda `_sinkron` biasa.
  static bool ubahIsianPekerjaan(Map<String, dynamic> doc, String pekerjaanId, Map<String, dynamic> isian,
      {required bool tandaiUbah}) {
    final k = pekerjaan(doc, pekerjaanId);
    if (k == null) return false;
    k.addAll(isian);
    if (tandaiUbah) {
      k[ubah] = lokal;
      k.remove(galatUbah);
    }
    return true;
  }

  /// Tandai PERUBAHAN satu node (`_ubah`), bukan pembuatannya. null = perubahan sudah diterima / dibatalkan.
  static void tandaiUbahNode(Map<String, dynamic> doc, String id, String? status, {String? pesan}) {
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

  static void tambahPg(Map<String, dynamic> doc, Map<String, dynamic> node) =>
      _anak(doc, 'objek').add({...node, 'pekerjaan': <dynamic>[], sinkron: lokal});

  static bool tambahPekerjaan(Map<String, dynamic> doc, String pgId, Map<String, dynamic> node) {
    final p = pg(doc, pgId);
    if (p == null) return false;
    _anak(p, 'pekerjaan').add({...node, 'material': <dynamic>[], 'grounding': <dynamic>[], 'pemerataan': <dynamic>[], sinkron: lokal});
    return true;
  }

  static bool tambahAnak(Map<String, dynamic> doc, String jenis, String pekerjaanId, Map<String, dynamic> node) {
    final k = pekerjaan(doc, pekerjaanId);
    if (k == null || !anakPekerjaan.containsKey(jenis)) return false;
    _anak(k, jenis).add({...node, sinkron: lokal});
    return true;
  }

  /// Tandai node (null = bersih / sudah diterima server).
  static void tandai(Map<String, dynamic> doc, String id, String? status, {String? pesan}) {
    final n = cari(doc, id);
    if (n == null) return;
    if (status == null) {
      n.remove(sinkron);
      n.remove(galat);
    } else {
      n[sinkron] = status;
      if (pesan == null) {
        n.remove(galat);
      } else {
        n[galat] = pesan;
      }
    }
  }

  static void tandaiUbahHeader(Map<String, dynamic> doc, String? status, {String? pesan}) {
    final h = doc['header'];
    if (h is! Map<String, dynamic>) return;
    if (status == null) {
      h.remove(ubah);
      h.remove(galatUbah);
    } else {
      h[ubah] = status;
      if (pesan == null) {
        h.remove(galatUbah);
      } else {
        h[galatUbah] = pesan;
      }
    }
  }

  /// Jawaban server diterima: kode diisi, tanda dibersihkan.
  static void diterima(Map<String, dynamic> doc, String aksi, String id, Map<String, dynamic> hasil) {
    final n = cari(doc, id);
    if (n == null) return;
    final kolom = kodeAksi[aksi];
    if (kolom != null && _t(hasil[kolom]).isNotEmpty) n[kolom] = _t(hasil[kolom]);
    if (aksi == 'simpanPekerjaan') {
      if (_t(hasil['pekerjaan']).isNotEmpty) n['pekerjaan'] = _t(hasil['pekerjaan']);
      if (hasil.containsKey('kolomGaspol')) n['kolomGaspol'] = _t(hasil['kolomGaspol']);
    }
    n.remove(sinkron);
    n.remove(galat);
  }

  /// Header lokal ternyata ikut header server lain (perangkat lain tim / laporan dari instalasi sebelumnya).
  static void gantiHeaderId(Map<String, dynamic> doc, String lama, String baru, String kode) {
    final h = doc['header'];
    if (h is! Map<String, dynamic> || _t(h['headerId']) != lama) return;
    h['headerId'] = baru;
    if (kode.isNotEmpty) h['kodeHeader'] = kode;
    h.remove(sinkron);
    h.remove(galat);
  }

  /// Hapus node + turunannya. Header = seluruh laporan lokal hari itu.
  static void buang(Map<String, dynamic> doc, String id) {
    final h = doc['header'];
    if (h is Map<String, dynamic> && _t(h['headerId']) == id) {
      doc['header'] = null;
      doc['objek'] = <dynamic>[];
      return;
    }
    final objek = _anak(doc, 'objek');
    objek.removeWhere((p) => p is Map && _t(p['pgId']) == id);
    for (final p in objek.whereType<Map<String, dynamic>>()) {
      final jobs = _anak(p, 'pekerjaan');
      jobs.removeWhere((k) => k is Map && _t(k['pekerjaanId']) == id);
      for (final k in jobs.whereType<Map<String, dynamic>>()) {
        for (final jenis in anakPekerjaan.keys) {
          _anak(k, jenis).removeWhere((a) => a is Map && _t(a['idBaris']) == id);
        }
      }
    }
  }

  // ---------- hitung ----------

  /// (menunggu, gagal) seluruh node dokumen, termasuk perubahan header.
  static ({int menunggu, int gagal}) hitung(Map<String, dynamic>? doc) {
    var m = 0, g = 0;
    void cek(Map<String, dynamic> n) {
      if (n[sinkron] == lokal) m++;
      if (n[sinkron] == gagal) g++;
      final f = hitungFotoNode(n);
      m += f.menunggu;
      g += f.gagal;
    }

    if (doc == null) return (menunggu: 0, gagal: 0);
    final h = doc['header'];
    if (h is Map<String, dynamic>) {
      cek(h);
      if (h[ubah] == lokal) m++;
      if (h[ubah] == gagal) g++;
    }
    for (final p in daftar(doc['objek'])) {
      cek(p);
      for (final k in daftar(p['pekerjaan'])) {
        cek(k);
        if (k[ubah] == lokal) m++;   // v0.97.0: perubahan jumlah pekerjaan
        if (k[ubah] == gagal) g++;
        for (final jenis in anakPekerjaan.keys) {
          daftar(k[jenis]).forEach(cek);
        }
      }
    }
    return (menunggu: m, gagal: g);
  }

  /// Aturan GARDU_GANDA server di HP: satu gardu boleh dua kali hanya untuk pasangan Gardu + Non - Teknik.
  static bool garduGanda(Map<String, dynamic> doc, String noGardu, String jenisBaru) {
    final no = noGardu.trim().toUpperCase();
    final ada = daftar(doc['objek'])
        .where((p) => _t(p['jenisPekerjaan']) != 'Jaringan' && _t(p['noGardu']).toUpperCase() == no)
        .map((p) => _t(p['jenisPekerjaan']))
        .toList();
    if (ada.isEmpty) return false;
    final tag = ([...ada, jenisBaru]..sort()).join('|');
    return !(ada.length == 1 && tag == 'Gardu|Non - Teknik');
  }

  // ---------- gabung dengan server ----------

  /// Gabungkan dokumen lokal dengan getHartekHarian. Server menang untuk semua data yang sudah diterimanya;
  /// node lokal bertanda (LOKAL / GAGAL) yang belum ada di server tetap disimpan di bawah induknya (dicocokkan per ID).
  static Map<String, dynamic> gabung(Map<String, dynamic> lokalDoc, Map<String, dynamic> server) {
    final hLokal = lokalDoc['header'] is Map<String, dynamic> ? lokalDoc['header'] as Map<String, dynamic> : null;
    final hServer = server['header'] is Map ? (server['header'] as Map).cast<String, dynamic>() : null;
    final adaTanda = hitung(lokalDoc);
    final punyaTanda = adaTanda.menunggu + adaTanda.gagal > 0;
    final tanggal = _t(server['tanggal']).isNotEmpty ? _t(server['tanggal']) : _t(lokalDoc['tanggal']);
    // header lokal belum diterima server: dokumen lokal dipertahankan sampai antrean header selesai / dibuang
    if (hLokal != null && tertunda(hLokal)) return salin(lokalDoc);
    if (hServer == null) {
      return punyaTanda && hLokal != null ? salin(lokalDoc) : kosong(tanggal);
    }
    if (hLokal != null && _t(hLokal['headerId']) != _t(hServer['headerId']) && punyaTanda) return salin(lokalDoc);
    final hasil = salin({'tanggal': tanggal, 'header': hServer, 'objek': server['objek'] ?? <dynamic>[]});
    final h = hasil['header'] as Map<String, dynamic>;
    if (hLokal != null) {
      if (_t(hLokal['koordinatAwal']).isNotEmpty &&
          _t(hLokal['koordinatAwal']) == _t(h['koordinatAwal']) &&
          hLokal['_akurasi_koordinatAwal'] != null) {
        h['_akurasi_koordinatAwal'] = hLokal['_akurasi_koordinatAwal'];
      }
      if (_t(hLokal['koordinatAkhir']).isNotEmpty &&
          _t(hLokal['koordinatAkhir']) == _t(h['koordinatAkhir']) &&
          hLokal['_akurasi_koordinatAkhir'] != null) {
        h['_akurasi_koordinatAkhir'] = hLokal['_akurasi_koordinatAkhir'];
      }
    }
    if (hLokal != null && hLokal[ubah] != null) {
      // perubahan Laporan Utama yang belum terkirim tetap tampil (revision ikut server)
      for (final k in const [
        'koordinatAwal',
        'koordinatAkhir',
        'kmAwal',
        'kmAkhir',
        'kendala',
        '_akurasi_koordinatAwal',
        '_akurasi_koordinatAkhir'
      ]) {
        if (hLokal.containsKey(k)) h[k] = hLokal[k];
      }
      h[ubah] = hLokal[ubah];
      if (hLokal[galatUbah] != null) h[galatUbah] = hLokal[galatUbah];
    }
    if (hLokal == null || _t(hLokal['headerId']) != _t(hServer['headerId'])) return hasil;
    hasil['objek'] = _gabungList(daftar(hasil['objek']), daftar(lokalDoc['objek']), 'pgId');
    return hasil;
  }

  static List<dynamic> _gabungList(List<Map<String, dynamic>> server, List<Map<String, dynamic>> lokalList, String kunciId) {
    final hasil = <dynamic>[...server];
    for (final l in lokalList) {
      final id = _t(l[kunciId]);
      final s = server.where((x) => _t(x[kunciId]) == id).firstOrNull;
      if (s == null) {
        if (tertunda(l) || punyaFotoTertunda(l)) hasil.add(salin(l));
        continue;
      }
      if (kunciId == 'pgId') {
        s['pekerjaan'] = _gabungList(daftar(s['pekerjaan']), daftar(l['pekerjaan']), 'pekerjaanId');
      } else if (kunciId == 'pekerjaanId') {
        // v0.97.0 / v0.97.4: perubahan pekerjaan + jumlah yang belum terkirim tetap tampil; revision tetap dari server
        if (l[ubah] != null) {
          for (final k in const ['pekerjaan', 'jenisId', 'jumlahPekerjaan', 'satuanPekerjaan', 'kolomGaspol', 'labelGaspol']) {
            if (l.containsKey(k)) s[k] = l[k];
          }
          s[ubah] = l[ubah];
          if (l[galatUbah] != null) s[galatUbah] = l[galatUbah];
        }
        for (final jenis in anakPekerjaan.keys) {
          s[jenis] = _gabungList(daftar(s[jenis]), daftar(l[jenis]), 'idBaris');
        }
      } else if (kunciId == 'idBaris') {
        // v1.0.0: file foto di HP + status foto yang belum terkirim tetap ada; link server (`foto`) dari server
        bawaFotoLokal(l, s);
      }
    }
    return hasil;
  }
}
