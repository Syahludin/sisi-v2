import 'dart:convert';

import 'package:flutter/material.dart';

import '../../core/sesi.dart';
import '../hartek/hartek_gaya.dart' show tanggalHartek;
import '../hartek/hartek_rincian.dart' show waTeksHartek;
import '../hartek/hartek_store.dart' show GudangHartek;
import '../insdu/insdu_bantu.dart' show waTeksInsDu;
import '../insjar/insjar_lokal.dart' show waTeksInsJar;

/// v1.0.17 (permintaan kvlar 22 Okt 2026): Arsip Laporan modul Hartek, Inspeksi Jaringan, Inspeksi Gardu, meniru tab
/// Arsip ROW: unduh per bulan (server maks 31 hari, sampai kemarin), simpan di HP, tampil tahun > bulan > hari.
/// Logika murni + simpanan di sini, tampilan di arsip_tim_view.dart.

String _t(Object? v) => v?.toString().trim() ?? '';

List<Map<String, dynamic>> _daftar(Object? v) =>
    v is List ? [for (final x in v) if (x is Map) Map<String, dynamic>.from(x)] : const <Map<String, dynamic>>[];

num _angka(Object? v) => num.tryParse(_t(v).replaceAll(',', '.')) ?? 0;

String _angkaTeks(Object? v) {
  final n = _angka(v);
  return n == n.roundToDouble() ? n.toInt().toString() : n.toString();
}

/// Satu bagian rincian arsip: judul + baris.
typedef BagianArsip = ({String judul, List<String> baris});

/// Pengaturan arsip per modul.
class ModulArsipTim {
  const ModulArsipTim._(this.kode, this.endpoint, this.judul, this.ikon, this._ringkas, this._wa, this._rincian);

  final String kode, endpoint, judul;
  final IconData ikon;
  final List<(String, int)> Function(Map<String, dynamic> doc) _ringkas;
  final String Function(Map<String, dynamic> doc, Sesi s) _wa;
  final List<BagianArsip> Function(Map<String, dynamic> doc) _rincian;

  List<(String, int)> ringkas(Map<String, dynamic> doc) => _ringkas(doc);
  String waTeks(Map<String, dynamic> doc, Sesi s) => _wa(doc, s);
  List<BagianArsip> rincian(Map<String, dynamic> doc) => _rincian(doc);

  static final hartek = ModulArsipTim._('HARTEK', 'getArsipHartek', 'Laporan Hartek', Icons.edit_note_rounded, (d) {
    final objek = _daftar(d['objek']);
    final pk = [for (final p in objek) ..._daftar(p['pekerjaan'])];
    return [
      ('Lokasi', objek.length),
      ('Pekerjaan', pk.length),
      ('Material', pk.fold<int>(0, (a, k) => a + _daftar(k['material']).length)),
    ];
  }, (d, s) {
    final h = d['header'] is Map ? Map<String, dynamic>.from(d['header'] as Map) : <String, dynamic>{};
    return waTeksHartek(
        kodeHeader: _t(h['kodeHeader']), tanggal: _t(d['tanggal']), tim: s.timNama, ulp: s.ulp, header: h, objek: _daftar(d['objek']));
  }, (d) => [
        for (final p in _daftar(d['objek']))
          (
            judul: [
              _t(p['jenisPekerjaan']),
              if (_t(p['noGardu']).isNotEmpty) 'Gardu ${_t(p['noGardu'])}' else [_t(p['penyulang']), _t(p['section'])].where((x) => x.isNotEmpty).join(' · '),
            ].where((x) => x.isNotEmpty).join(': '),
            baris: [
              for (final k in _daftar(p['pekerjaan'])) ...[
                '${_t(k['pekerjaan'])} ${_angkaTeks(k['jumlahPekerjaan'])} ${_t(k['satuanPekerjaan'])}'.trim(),
                for (final m in _daftar(k['material']))
                  '   ↳ ${_t(m['material'])} ${_angkaTeks(m['jumlah'])} ${_t(m['satuan'])}${_t(m['kepemilikan']).isEmpty ? '' : ' (${_t(m['kepemilikan'])})'}',
              ],
            ],
          ),
      ]);

  static final insjar = ModulArsipTim._('INSJAR', 'getArsipInsJar', 'Laporan Inspeksi Jaringan', Icons.travel_explore_rounded, (d) {
    final r = _daftar(d['realisasi']);
    return [
      ('Penyulang', r.length),
      ('Temuan', r.fold<int>(0, (a, x) => a + _daftar(x['temuan']).length)),
      ('Total Tiang', r.fold<int>(0, (a, x) => a + _angka(x['totalTiang']).round())),
    ];
  }, (d, s) => waTeksInsJar(
          tanggalTampil: tanggalHartek(_t(d['tanggal'])),
          header: d['header'] is Map ? Map<String, dynamic>.from(d['header'] as Map) : <String, dynamic>{},
          realisasi: _daftar(d['realisasi'])),
      (d) => [
            for (final r in _daftar(d['realisasi']))
              (
                judul: [_t(r['penyulang']), _t(r['tier']), _t(r['section'])].where((x) => x.isNotEmpty).join(' · '),
                baris: [
                  'Total tiang ${_angkaTeks(r['totalTiang'])}',
                  for (final t in _daftar(r['temuan']))
                    '• ${_t(t['jenisTemuan'])}${_t(t['nomorTiang']).isEmpty ? '' : ' · Tiang ${_t(t['nomorTiang'])}'}',
                ],
              ),
          ]);

  static final insdu = ModulArsipTim._('INSDU', 'getArsipInsDu', 'Laporan Inspeksi Gardu', Icons.electrical_services_rounded, (d) {
    final r = _daftar(d['realisasi']);
    return [
      ('Gardu', r.length),
      ('Temuan', r.fold<int>(0, (a, x) => a + _daftar(x['temuan']).length)),
      ('Masuk laporan', r.where((x) => x['masukLaporan'] == true).length),
    ];
  }, (d, s) => waTeksInsDu(
          tanggalTampil: tanggalHartek(_t(d['tanggal'])),
          header: d['header'] is Map ? Map<String, dynamic>.from(d['header'] as Map) : <String, dynamic>{},
          realisasi: _daftar(d['realisasi'])),
      (d) => [
            for (final r in _daftar(d['realisasi']))
              (
                judul: ['Gardu ${_t(r['noGardu'])}', _t(r['penyulang']), _t(r['tier'])].where((x) => x.isNotEmpty).join(' · '),
                baris: [
                  if (_t(r['statusUkur']).isNotEmpty) 'Pengukuran: ${_t(r['statusUkur'])}',
                  for (final t in _daftar(r['temuan'])) '• ${_t(t['jenisTemuan'])}',
                ],
              ),
          ]);

  static ModulArsipTim? dariKode(String kode) => switch (kode) {
        'HARTEK' => hartek,
        'INSJAR' => insjar,
        'INSDU' => insdu,
        _ => null,
      };
}

/// Potongan rentang per bulan kalender (tiap potongan <= 31 hari), urut terbaru dulu (sama dengan unduh arsip ROW).
List<({DateTime dari, DateTime sampai})> potonganBulanArsip(DateTime dari, DateTime sampai) {
  final hasil = <({DateTime dari, DateTime sampai})>[];
  var awal = DateTime(dari.year, dari.month, dari.day);
  final akhir = DateTime(sampai.year, sampai.month, sampai.day);
  while (!awal.isAfter(akhir)) {
    final ujungBulan = DateTime(awal.year, awal.month + 1, 0);
    final ujung = ujungBulan.isAfter(akhir) ? akhir : ujungBulan;
    hasil.add((dari: awal, sampai: ujung));
    awal = ujung.add(const Duration(days: 1));
  }
  return hasil.reversed.toList();
}

String isoArsip(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// Simpanan arsip per modul + akun (master_cache). Laporan disimpan per headerId (unduh ulang = diganti).
class SimpananArsipTim {
  SimpananArsipTim(this._gudang);
  final GudangHartek _gudang;

  static String kunci(String modul, String userId) => 'arsip_${modul}_$userId';

  Future<List<Map<String, dynamic>>> baca(String modul, String userId) async {
    try {
      final r = await _gudang.bacaMaster(kunci(modul, userId));
      if (r == null) return const [];
      return _daftar((jsonDecode(r.json) as Map)['laporan']);
    } catch (_) {
      return const [];
    }
  }

  /// Gabung hasil unduh rentang [dari]..[sampai]: laporan lama di rentang itu diganti hasil server.
  static List<Map<String, dynamic>> gabung(List<Map<String, dynamic>> lama, List<Map<String, dynamic>> baru, String dari, String sampai) {
    final l = [
      for (final x in lama)
        if (_t(x['tanggal']).compareTo(dari) < 0 || _t(x['tanggal']).compareTo(sampai) > 0) x,
      ...baru,
    ]..sort((a, b) => _t(b['tanggal']).compareTo(_t(a['tanggal'])));
    return l;
  }

  Future<void> tulis(String modul, String userId, List<Map<String, dynamic>> laporan) =>
      _gudang.tulisMaster(kunci(modul, userId), jsonEncode({'laporan': laporan}));

  Future<void> hapus(String modul, String userId) => _gudang.tulisMaster(kunci(modul, userId), jsonEncode({'laporan': const []}));
}
