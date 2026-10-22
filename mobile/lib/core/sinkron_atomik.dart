import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';

import 'api_client.dart';
import 'kode_error.dart';
import 'sesi.dart';

/// v1.0.17 (permintaan kvlar 22 Okt 2026): SINKRONISASI ATOMIK laporan tim (Hartek, Inspeksi Jaringan, Inspeksi Gardu).
///
/// Antrean HP dikirim satu per satu, jadi selama antrean belum habis ringkasan di server sudah berubah sementara
/// rincian / foto / format WA belum lengkap. Status "tersinkron" (cloud hijau, tombol WA, SIAP WA admin) kini hanya
/// diberikan kalau:
///   1. antrean laporan hari itu kosong (tidak ada yang menunggu / ditolak), dan
///   2. laporan sudah DISEGEL: ringkasan HP (jumlah baris tiap bagian + foto + sidik ID) sama dengan ringkasan yang
///      disusun server dari sheet (endpoint segelSinkronHartek / InsJar / InsDu, backend modules/76_SinkronAtomik.js), dan
///   3. isi laporan di HP masih sama dengan ringkasan saat disegel (data baru = proses lagi sampai disegel ulang).
/// Rumus [ringkasSinkron] HARUS sama persis dengan ringkasSegel_ di server.

/// Bagian ringkasan per modul (urutan = urutan tampil).
const Map<String, List<String>> bagianSinkron = {
  'HARTEK': ['header', 'lokasi', 'pekerjaan', 'material', 'grounding', 'pemerataan', 'foto', 'sidik'],
  'INSJAR': ['header', 'realisasi', 'temuan', 'foto', 'sidik'],
  'INSDU': ['header', 'realisasi', 'temuan', 'foto', 'sidik'],
};

/// FNV-1a 32 bit atas kode UTF-16, 8 digit hex (= fnv1aSegel_ server).
String sidikSinkron(String s) {
  var h = 0x811c9dc5;
  for (final c in s.codeUnits) {
    h ^= c;
    h = (h * 0x01000193) & 0xFFFFFFFF;
  }
  return h.toRadixString(16).padLeft(8, '0');
}

String _t(Object? v) => v?.toString().trim() ?? '';

List<Map<String, dynamic>> _daftar(Object? v) =>
    v is List ? [for (final x in v) if (x is Map) Map<String, dynamic>.from(x)] : const <Map<String, dynamic>>[];

/// Ringkasan laporan dari dokumen (bentuk getHartekHarian / getInsJarHarian / getInsDuHarian, juga dokumen HP).
Map<String, Object> ringkasSinkron(String modul, Map<String, dynamic>? doc) {
  final r = <String, Object>{for (final k in bagianSinkron[modul]!) if (k != 'sidik') k: 0};
  final id = <String>[];
  var foto = 0;
  void tambah(String k) => r[k] = (r[k] as int) + 1;
  void hitFoto(Map<String, dynamic> n) {
    final f = n['foto'];
    if (f is! Map) return;
    for (final v in f.values) {
      if (_t(v).isNotEmpty) foto++;
    }
  }

  final h = doc?['header'];
  if (h is Map) {
    r['header'] = 1;
    id.add('H:${_t(h['headerId'])}');
  }
  if (modul == 'HARTEK') {
    for (final pg in _daftar(doc?['objek'])) {
      tambah('lokasi');
      id.add('P:${_t(pg['pgId'])}');
      for (final pk in _daftar(pg['pekerjaan'])) {
        tambah('pekerjaan');
        id.add('K:${_t(pk['pekerjaanId'])}');
        for (final j in const ['material', 'grounding', 'pemerataan']) {
          for (final a in _daftar(pk[j])) {
            tambah(j);
            id.add('${j[0].toUpperCase()}:${_t(a['idBaris'])}');
            hitFoto(a);
          }
        }
      }
    }
  } else {
    for (final re in _daftar(doc?['realisasi'])) {
      tambah('realisasi');
      id.add('R:${_t(re['realisasiId'])}');
      for (final t in _daftar(re['temuan'])) {
        tambah('temuan');
        id.add('T:${_t(t['temuanId'])}');
        hitFoto(t);
      }
    }
  }
  r['foto'] = foto;
  id.sort();
  r['sidik'] = sidikSinkron(id.join('|'));
  return r;
}

bool samaRingkasSinkron(String modul, Map<String, dynamic>? a, Map<String, dynamic>? b) =>
    a != null && b != null && bagianSinkron[modul]!.every((k) => '${a[k]}' == '${b[k]}');

/// Tahap sinkron satu laporan.
enum TahapSinkron {
  /// belum ada Laporan Utama
  kosong,

  /// antrean HP belum habis (SiSi Sedang Proses Sinkron Data)
  proses,

  /// ada data ditolak server: laporan tidak bisa final sampai diperbaiki
  ditolak,

  /// antrean habis, menunggu segel / ringkasan berubah sesudah segel
  memverifikasi,

  /// semua data diterima + divalidasi server bersamaan
  tersinkron,
}

TahapSinkron tahapSinkron(String modul,
    {required Map<String, dynamic>? doc, required int menunggu, required int gagal, required Map<String, dynamic>? segel}) {
  if (doc == null || doc['header'] is! Map) return TahapSinkron.kosong;
  if (gagal > 0) return TahapSinkron.ditolak;
  if (menunggu > 0) return TahapSinkron.proses;
  final rk = segel?['ringkas'];
  if (_t(segel?['status']) == 'LENGKAP' && rk is Map && samaRingkasSinkron(modul, Map<String, dynamic>.from(rk), ringkasSinkron(modul, doc))) {
    return TahapSinkron.tersinkron;
  }
  return TahapSinkron.memverifikasi;
}

/// Teks kartu status laporan (tampilan modul tim).
({String judul, String isi}) teksTahapSinkron(TahapSinkron t, {int menunggu = 0, int gagal = 0}) => switch (t) {
      TahapSinkron.kosong => (judul: 'Belum ada laporan', isi: ''),
      TahapSinkron.proses => (judul: 'SiSi Sedang Proses Sinkron Data', isi: '$menunggu Data Sedang Proses Sinkron'),
      TahapSinkron.ditolak => (judul: '$gagal data ditolak server', isi: 'Perbaiki dulu. Laporan baru final sesudah semua data diterima server.'),
      TahapSinkron.memverifikasi => (judul: 'Memvalidasi laporan di server', isi: 'Semua data terkirim, menunggu pencocokan ringkasan, rincian, dan WA.'),
      TahapSinkron.tersinkron => (judul: 'Semua data tersinkron', isi: 'Ringkasan, rincian, realisasi, dan format WA sudah divalidasi server.'),
    };

/// Penyimpan + pengirim segel laporan per modul. Segel disimpan di cache master HP (bukan di dokumen laporan, supaya
/// tidak hilang saat laporan ditarik ulang dari server).
class PenyegelSinkron extends ChangeNotifier {
  PenyegelSinkron({
    required this.modul,
    required this.endpoint,
    required Future<({String json, DateTime diambil})?> Function(String kunci) baca,
    required Future<void> Function(String kunci, String json) tulis,
    required Future<Map<String, dynamic>> Function(Sesi s, String aksi, Map<String, dynamic> data) panggil,
  })  : _baca = baca,
        _tulis = tulis,
        _panggil = panggil;

  final String modul, endpoint;
  final Future<({String json, DateTime diambil})?> Function(String kunci) _baca;
  final Future<void> Function(String kunci, String json) _tulis;
  final Future<Map<String, dynamic>> Function(Sesi s, String aksi, Map<String, dynamic> data) _panggil;

  final Map<String, Map<String, dynamic>> _memori = {};
  bool _jalan = false;

  String _kunci(String userId, String tanggal) => 'segel_${modul}_${userId}_$tanggal';

  /// Segel di memori (instan, untuk build layar). null = belum dimuat / belum pernah disegel.
  Map<String, dynamic>? instan(String userId, String tanggal) => _memori[_kunci(userId, tanggal)];

  Future<Map<String, dynamic>?> muat(String userId, String tanggal) async {
    final k = _kunci(userId, tanggal);
    if (_memori.containsKey(k)) return _memori[k];
    try {
      final ada = await _baca(k);
      if (ada == null) return null;
      final m = Map<String, dynamic>.from(jsonDecode(ada.json) as Map);
      _memori[k] = m;
      notifyListeners();
      return m;
    } catch (_) {
      return null;
    }
  }

  /// Segel laporan [doc] (antrean HARUS sudah kosong; dicek pemanggil). Hasil = segel tersimpan (status LENGKAP /
  /// TIDAK_COCOK). Galat jaringan / sesi diteruskan ke pemanggil.
  Future<Map<String, dynamic>?> segel(Sesi s, String tanggal, Map<String, dynamic> doc) async {
    if (doc['header'] is! Map || _jalan) return null;
    final rk = ringkasSinkron(modul, doc);
    final lama = await muat(s.userId, tanggal);
    if (_t(lama?['status']) == 'LENGKAP' && lama?['ringkas'] is Map && samaRingkasSinkron(modul, Map<String, dynamic>.from(lama!['ringkas'] as Map), rk)) {
      return lama; // isi laporan tidak berubah sejak segel terakhir: tidak perlu panggil server
    }
    _jalan = true;
    try {
      final r = await _panggil(s, endpoint, {'ringkas': jsonEncode(rk)});
      final hasil = <String, dynamic>{
        'status': _t(r['status']).isEmpty ? (r['cocok'] == true ? 'LENGKAP' : 'TIDAK_COCOK') : _t(r['status']),
        'ringkas': rk,
        'ringkasServer': r['ringkasServer'],
        'waktu': _t(r['waktu']),
      };
      final k = _kunci(s.userId, tanggal);
      _memori[k] = hasil;
      await _tulis(k, jsonEncode(hasil));
      notifyListeners();
      return hasil;
    } on ApiException catch (e) {
      if (KodeError.sesiHabis.contains(e.kode)) rethrow;
      if (e.kode == 'DATA_TIDAK_DITEMUKAN') return null; // Laporan Utama belum sampai server
      rethrow;
    } finally {
      _jalan = false;
    }
  }
}
