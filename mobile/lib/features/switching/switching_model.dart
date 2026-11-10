import 'dart:math' as math;

import 'package:flutter/material.dart';

/// 1.0.63 Master Switching (menu OPS_MASTER_SWITCHING, ADMIN / SUPER): model + logika murni (diuji di test/switching_test.dart).
/// Mirror web (web/src/masterSwitching.js). Data = getMasterSwitching { switching, jaringan, waktu }.

class JenisSwitching {
  const JenisSwitching(this.kode, this.nama, this.warna, this.bisaTrip);
  final String kode;
  final String nama;
  final Color warna;
  final bool bisaTrip; // bawaan isian: PMT / ACR / FCO memutus arus gangguan
}

/// Warna sama dengan web (titik peta + lencana).
const jenisSwitching = [
  JenisSwitching('PMT', 'Pemutus (PMT)', Color(0xFF7C3AED), true),
  JenisSwitching('ACR', 'Recloser (ACR)', Color(0xFFDC2626), true),
  JenisSwitching('SSO', 'Sectionalizer (SSO)', Color(0xFFEA580C), false),
  JenisSwitching('LBS', 'Load Break Switch (LBS)', Color(0xFF2563EB), false),
  JenisSwitching('FCO', 'Fuse Cut Out (FCO)', Color(0xFF16A34A), true),
  JenisSwitching('DS', 'Disconnecting Switch (DS)', Color(0xFF64748B), false),
];

JenisSwitching infoJenis(String kode) =>
    jenisSwitching.firstWhere((j) => j.kode == kode, orElse: () => JenisSwitching(kode, kode.isEmpty ? '-' : kode, const Color(0xFF64748B), false));

/// Pilihan isian (kode server, label). Urutan = urutan tampil.
const pilihanSwitching = <String, List<(String, String)>>{
  'posisiNormal': [('NC', 'Normal Tertutup (NC)'), ('NO', 'Normal Terbuka (NO)')],
  'statusOperasi': [('OPERASI', 'Operasi'), ('TIDAK_OPERASI', 'Tidak Operasi'), ('DIBONGKAR', 'Dibongkar')],
  'kondisi': [('BAIK', 'Baik'), ('PERLU_PERBAIKAN', 'Perlu Perbaikan'), ('RUSAK', 'Rusak')],
  'media': [('VAKUM', 'Vakum'), ('SF6', 'SF6'), ('MINYAK', 'Minyak'), ('UDARA', 'Udara')],
  'penggerak': [('MANUAL', 'Manual'), ('MOTOR', 'Motor')],
  'mediaKomunikasi': [('GSM', 'GSM'), ('RADIO', 'Radio'), ('FO', 'Fiber Optik')],
  'fungsiFco': [('CABANG', 'Percabangan'), ('GARDU', 'Gardu')],
  'fuseTipe': [('K', 'K'), ('T', 'T'), ('H', 'H')],
  'statusVerifikasi': [('TERVERIFIKASI', 'Terverifikasi'), ('PERLU_PERBAIKAN', 'Perlu Perbaikan')],
};

/// Judul / label gaya Proper: huruf awal tiap kata besar ("switching aktif" -> "Switching Aktif"). Kata yang sudah memuat huruf
/// besar / angka (kV, FCO, CT, ASSETNUM) dan tanda baca dibiarkan; awalan tanda baca ("(bisa") tetap ("(Bisa").
String proper(String s) => s.split(' ').map((w) {
      final i = w.indexOf(RegExp('[A-Za-z]'));
      if (i < 0) return w;
      final huruf = w.replaceAll(RegExp('[^A-Za-z]'), '');
      if (huruf != huruf.toLowerCase()) return w;
      return w.substring(0, i) + w[i].toUpperCase() + w.substring(i + 1);
    }).join(' ');

/// Label switching untuk pilihan: jenis tidak diulang bila nama sudah diawali jenis ("PMT" + "PMT Palas" -> "PMT Palas").
String labelSwitching(String jenis, String nama) => nama.toUpperCase().startsWith(jenis.toUpperCase()) ? nama : '$jenis $nama'.trim();

String labelPilihan(String kunci, String kode) {
  for (final p in pilihanSwitching[kunci] ?? const <(String, String)>[]) {
    if (p.$1 == kode) return p.$2;
  }
  return '';
}

/// Status verifikasi: label + kelas warna ('ok' hijau, 'proses' kuning, 'belum' merah).
(String, String) infoStatus(String s) => switch (s) {
      'TERVERIFIKASI' => ('Terverifikasi', 'ok'),
      'PERLU_PERBAIKAN' => ('Perlu Perbaikan', 'proses'),
      _ => ('Belum Diverifikasi', 'belum'),
    };

const slotFotoSwitching = [('UNIT', 'Unit'), ('NAMEPLATE', 'Nameplate'), ('KONTROLER', 'Layar Kontroler')];

String _t(Object? v) => v == null ? '' : '$v'.trim();
double? _n(Object? v) => v is num ? v.toDouble() : double.tryParse(_t(v));
bool _b(Object? v) => v == true;

class Switching {
  Switching(this.d);

  /// Isian mentah dari server (kunci camelCase sama dengan payload simpanSwitching).
  final Map<String, dynamic> d;

  factory Switching.dariJson(Map<String, dynamic> j) => Switching(Map<String, dynamic>.from(j));

  String get id => _t(d['switchingId']);
  String get jenis => _t(d['jenis']);
  String get nama => _t(d['nama']);
  String get penyulang => _t(d['penyulang']);
  String teks(String k) => _t(d[k]);
  double? angka(String k) => _n(d[k]);
  bool ya(String k) => _b(d[k]);
  double? get lat => _n(d['lat']);
  double? get lng => _n(d['lng']);
  bool get adaTitik => lat != null && lng != null && !(lat == 0 && lng == 0);
  String get statusVerifikasi => _t(d['statusVerifikasi']).isEmpty ? 'BELUM' : _t(d['statusVerifikasi']);
  bool get aktif => _b(d['aktif']);
  int get revision => (d['revision'] is num) ? (d['revision'] as num).toInt() : int.tryParse(_t(d['revision'])) ?? 0;
  bool adaFoto(String slot) => (d['foto'] is Map) && (d['foto'] as Map)[slot] == true;

  Switching salin(Map<String, dynamic> ubah) => Switching({...d, ...ubah});
}

class JaringanSwitching {
  const JaringanSwitching(this.sectionId, this.penyulang, this.section);
  final String sectionId;
  final String penyulang;
  final String section;
}

class DataSwitching {
  DataSwitching(this.switching, this.jaringan, this.waktu);
  final List<Switching> switching;
  final List<JaringanSwitching> jaringan;
  final String waktu;

  factory DataSwitching.dariJson(Map<String, dynamic> j) => DataSwitching(
        [for (final x in (j['switching'] as List? ?? const []).whereType<Map<dynamic, dynamic>>()) Switching.dariJson(Map<String, dynamic>.from(x))],
        [
          for (final x in (j['jaringan'] as List? ?? const []).whereType<Map<dynamic, dynamic>>())
            JaringanSwitching(_t(x['sectionId']), _t(x['penyulang']), _t(x['section']))
        ],
        _t(j['waktu']),
      );

  Map<String, dynamic> get json => {
        'switching': [for (final s in switching) s.d],
        'jaringan': [
          for (final x in jaringan) {'sectionId': x.sectionId, 'penyulang': x.penyulang, 'section': x.section}
        ],
        'waktu': waktu,
      };

  List<String> get penyulang => ({
        for (final x in jaringan)
          if (x.penyulang.isNotEmpty) x.penyulang
      }.toList()
        ..sort());
  List<JaringanSwitching> sectionDari(String p) => [
        for (final x in jaringan)
          if (x.penyulang == p) x
      ];
  Switching? cari(String id) {
    for (final s in switching) {
      if (s.id == id) return s;
    }
    return null;
  }

  DataSwitching ganti(Switching s) {
    final ada = switching.any((x) => x.id == s.id);
    return DataSwitching(ada ? [for (final x in switching) x.id == s.id ? s : x] : [...switching, s], jaringan, waktu);
  }
}

class RingkasSwitching {
  int total = 0, terverifikasi = 0, perluPerbaikan = 0, belum = 0, tanpaTitik = 0, nonaktif = 0;
  final Map<String, int> jenis = {for (final j in jenisSwitching) j.kode: 0};
  int get persen => total == 0 ? 0 : (terverifikasi * 100 / total).round();
}

RingkasSwitching ringkasSwitching(List<Switching> daftar) {
  final r = RingkasSwitching();
  for (final s in daftar) {
    if (!s.aktif) {
      r.nonaktif++;
      continue;
    }
    r.total++;
    switch (s.statusVerifikasi) {
      case 'TERVERIFIKASI':
        r.terverifikasi++;
      case 'PERLU_PERBAIKAN':
        r.perluPerbaikan++;
      default:
        r.belum++;
    }
    r.jenis[s.jenis] = (r.jenis[s.jenis] ?? 0) + 1;
    if (!s.adaTitik) r.tanpaTitik++;
  }
  return r;
}

/// Saring di HP. Baris nonaktif hanya tampil bila [nonaktif] = true. Cari = nama, ID, penyulang, merk kontroler, kode aset.
List<Switching> saringSwitching(List<Switching> daftar,
    {String jenis = '', String penyulang = '', String status = '', String cari = '', bool nonaktif = false}) {
  final c = cari.trim().toLowerCase();
  return [
    for (final s in daftar)
      if ((nonaktif ? !s.aktif : s.aktif) &&
          (jenis.isEmpty || s.jenis == jenis) &&
          (penyulang.isEmpty || s.penyulang == penyulang) &&
          (status.isEmpty || s.statusVerifikasi == status) &&
          (c.isEmpty || [s.nama, s.id, s.penyulang, s.teks('merkKontroler'), s.teks('kodeAset')].any((v) => v.toLowerCase().contains(c))))
        s
  ];
}

/// Jarak (meter, pendekatan equirectangular, cukup untuk mengurutkan switching terdekat).
double jarakMeter(double lat1, double lng1, double lat2, double lng2) {
  const r = 6371000.0, rad = math.pi / 180;
  final x = (lng2 - lng1) * rad * math.cos((lat1 + lat2) / 2 * rad), y = (lat2 - lat1) * rad;
  return r * math.sqrt(x * x + y * y);
}

final _polaKoord = RegExp(r'^\s*-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?\s*$');
const _angka = ['tahunPasang', 'ratingKv', 'ratingA', 'kapasitasPutusKa'];
const _teksIsian = [
  'nama',
  'penyulang',
  'sectionId',
  'koordinat',
  'posisiNormal',
  'statusOperasi',
  'kondisi',
  'kodeAset',
  'merkKontroler',
  'tipeKontroler',
  'versiFirmware',
  'rasioCt',
  'rasioVt',
  'merk',
  'tipe',
  'nomorSeri',
  'media',
  'penggerak',
  'tiangId',
  'switchingHuluId',
  'catatan',
  'statusVerifikasi',
  'tiangSisiA',
  'tiangSisiB',
  'penyulangSisiB',
  'kodeRtu',
  'mediaKomunikasi',
  'fungsiFco',
  'fuseTipe',
  'fuseRating',
];
const _boolIsian = ['bisaTrip', 'catatGangguan', 'bacaArus', 'bacaTegangan', 'terhubungScada', 'titikHubung'];

/// Isian form (baru / ubah). Teks disimpan sebagai String, kosong = ''.
class IsianSwitching {
  IsianSwitching({this.penyulangAwal = ''}) {
    t['penyulang'] = penyulangAwal;
    t['posisiNormal'] = 'NC';
    t['statusOperasi'] = 'OPERASI';
    t['statusVerifikasi'] = 'TERVERIFIKASI';
    b['bisaTrip'] = infoJenis(jenis).bisaTrip;
  }

  final String penyulangAwal;
  String id = '';
  int revision = 0;
  String jenis = 'LBS';
  bool aktif = true;
  bool bisaTripDiubah = false;
  final Map<String, String> t = {
    for (final k in [..._teksIsian, ..._angka]) k: ''
  };
  final Map<String, bool> b = {for (final k in _boolIsian) k: false};

  bool get baru => id.isEmpty;

  factory IsianSwitching.dari(Switching s) {
    final i = IsianSwitching()
      ..id = s.id
      ..revision = s.revision
      ..jenis = s.jenis
      ..aktif = s.aktif
      ..bisaTripDiubah = true;
    for (final k in _teksIsian) {
      i.t[k] = s.teks(k);
    }
    for (final k in _angka) {
      final v = s.angka(k);
      i.t[k] = v == null ? '' : (v == v.roundToDouble() ? v.toInt().toString() : '$v');
    }
    for (final k in _boolIsian) {
      i.b[k] = s.ya(k);
    }
    i.t['koordinat'] = s.adaTitik ? '${s.lat}, ${s.lng}' : '';
    i.t['statusVerifikasi'] = s.statusVerifikasi == 'PERLU_PERBAIKAN' ? 'PERLU_PERBAIKAN' : 'TERVERIFIKASI';
    if (i.t['posisiNormal']!.isEmpty) i.t['posisiNormal'] = 'NC';
    if (i.t['statusOperasi']!.isEmpty) i.t['statusOperasi'] = 'OPERASI';
    return i;
  }

  /// Ganti jenis: bisaTrip mengikuti bawaan jenis selama admin belum mengubahnya sendiri.
  void gantiJenis(String j) {
    jenis = j;
    if (!bisaTripDiubah) b['bisaTrip'] = infoJenis(j).bisaTrip;
  }

  /// Galat per kolom sebelum dikirim (server tetap memeriksa ulang). Kosong = boleh dikirim.
  Map<String, String> cek(List<String> penyulang) {
    final g = <String, String>{};
    if (t['nama']!.trim().isEmpty) g['nama'] = 'Nama wajib diisi.';
    if (!penyulang.contains(t['penyulang'])) g['penyulang'] = 'Pilih penyulang dari daftar.';
    if (!_polaKoord.hasMatch(t['koordinat']!)) g['koordinat'] = 'Ambil GPS atau isi "lat, lng".';
    if (b['titikHubung']! && (t['penyulangSisiB']!.isEmpty || t['penyulangSisiB'] == t['penyulang'])) {
      g['penyulangSisiB'] = 'Pilih penyulang sisi lain (beda dengan penyulang).';
    }
    for (final k in _angka) {
      final v = t[k]!.trim();
      if (v.isNotEmpty && !RegExp(r'^\d+(\.\d+)?$').hasMatch(v)) g[k] = 'Isi angka saja.';
    }
    final th = int.tryParse(t['tahunPasang']!.trim());
    if (th != null && (th < 1950 || th > 2100)) g['tahunPasang'] = 'Tahun 1950 - 2100.';
    return g;
  }

  /// Payload simpanSwitching: kolom kosong tidak dikirim, angka jadi num, kolom yang tidak berlaku dibuang.
  Map<String, dynamic> payload() {
    final p = <String, dynamic>{'jenis': jenis};
    const umum = [
      'nama',
      'penyulang',
      'sectionId',
      'koordinat',
      'posisiNormal',
      'statusOperasi',
      'kondisi',
      'kodeAset',
      'merkKontroler',
      'tipeKontroler',
      'versiFirmware',
      'rasioCt',
      'rasioVt',
      'merk',
      'tipe',
      'nomorSeri',
      'media',
      'penggerak',
      'tiangId',
      'switchingHuluId',
      'catatan',
      'statusVerifikasi',
    ];
    void salin(String k) {
      final v = t[k]!.trim();
      if (v.isNotEmpty) p[k] = v;
    }

    umum.forEach(salin);
    for (final k in _angka) {
      final v = num.tryParse(t[k]!.trim());
      if (v != null) p[k] = v;
    }
    for (final k in _boolIsian) {
      p[k] = b[k]!;
    }
    if (b['titikHubung']!) ['tiangSisiA', 'tiangSisiB', 'penyulangSisiB'].forEach(salin);
    if (b['terhubungScada']!) ['kodeRtu', 'mediaKomunikasi'].forEach(salin);
    if (jenis == 'FCO') ['fungsiFco', 'fuseTipe', 'fuseRating'].forEach(salin);
    if (!baru) {
      p['switchingId'] = id;
      p['revision'] = revision;
      p['aktif'] = aktif;
    }
    return p;
  }
}

/// Pilihan switching hulu: aktif, penyulang sama, bukan diri sendiri (urut nama).
List<Switching> pilihanHulu(List<Switching> daftar, IsianSwitching i) => [
      for (final s in daftar)
        if (s.aktif && s.id != i.id && (i.t['penyulang']!.isEmpty || s.penyulang == i.t['penyulang'])) s
    ]..sort((a, b) => a.nama.compareTo(b.nama));
