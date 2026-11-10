/// v1.0.57 Gudang Material (permintaan Master Guswan 3 Nov 2026): model data + aturan murni, dipakai layar Yandal (Stok Material) dan
/// admin (Material Gudang). Stok dihitung server dari buku mutasi; HP hanya menampilkan dan mengirim isian.
/// Rancangan: docs/superpowers/specs/2026-11-03-gudang-material-design.md.
library;

const List<String> statusMcb = ['Baru', 'Ex-Handal'];
const int jumlahMaks = 100000;

/// Daya untuk tampilan: angka saja diberi satuan A ('2' -> '2A'); nilai lama berhuruf ('2A') apa adanya.
String teksDaya(String daya) => RegExp(r'^\d+$').hasMatch(daya.trim()) ? '${daya.trim()}A' : daya.trim();

String _t(Object? v) => v == null ? '' : '$v'.trim();
int _n(Object? v) => v is num ? v.toInt() : int.tryParse(_t(v)) ?? 0;
List<Map<String, dynamic>> _peta(Object? v) =>
    [for (final x in (v is List ? v : const []).whereType<Map<dynamic, dynamic>>()) Map<String, dynamic>.from(x)];

/// Satu jenis MCB beserta jumlahnya (stok gudang / tim).
class JenisMcb {
  const JenisMcb({required this.materialId, required this.daya, required this.merk, required this.statusMcb, required this.jumlah});
  factory JenisMcb.dariJson(Map<String, dynamic> j) =>
      JenisMcb(materialId: _t(j['materialId']), daya: _t(j['daya']), merk: _t(j['merk']), statusMcb: _t(j['statusMcb']), jumlah: _n(j['jumlah']));
  final String materialId, daya, merk, statusMcb;
  final int jumlah;

  /// Kunci sama dengan server (kunciJenis_): material|daya|merk|status.
  String get kunci => '$materialId|$daya|$merk|$statusMcb';
  String get label => '${teksDaya(daya)} $merk $statusMcb';
}

/// Satu MCB yang dimasukkan petugas saat pemeriksaan awal shift (satu entri = satu MCB).
class EntriMcb {
  const EntriMcb({required this.daya, required this.merk, required this.statusMcb});
  final String daya, merk, statusMcb;
  String get kunci => '$daya|$merk|$statusMcb';
  String get label => '${teksDaya(daya)} $merk $statusMcb';
  Map<String, dynamic> get json => {'daya': daya, 'merk': merk, 'statusMcb': statusMcb};
}

/// Jumlah entri per jenis (urut kunci), untuk ringkasan di layar pemeriksaan.
Map<String, int> kelompokkanEntri(List<EntriMcb> entri) {
  final h = <String, int>{};
  for (final e in entri) {
    h[e.kunci] = (h[e.kunci] ?? 0) + 1;
  }
  return Map.fromEntries(h.entries.toList()..sort((a, b) => a.key.compareTo(b.key)));
}

/// '3 × 2A Schneider Baru; 1 × 4A Hager Ex-Handal', '-' bila kosong.
String ringkasJenis(List<JenisMcb> daftar) {
  final l = daftar.where((j) => j.jumlah != 0).toList();
  return l.isEmpty ? '-' : l.map((j) => '${j.jumlah} × ${j.label}').join('; ');
}

int totalJenis(List<JenisMcb> daftar) => daftar.fold(0, (a, j) => a + j.jumlah);

/// Galat isian jumlah (bilangan bulat min..jumlahMaks) atau null bila sah.
String? galatJumlah(String teks, {int min = 1}) {
  final t = teks.trim();
  if (t.isEmpty) return 'Isi jumlah.';
  if (!RegExp(r'^\d+$').hasMatch(t)) return 'Jumlah harus bilangan bulat.';
  final n = int.parse(t);
  if (n < min) return min == 0 ? 'Jumlah tidak boleh negatif.' : 'Jumlah minimal $min.';
  if (n > jumlahMaks) return 'Jumlah terlalu besar.';
  return null;
}

/// Cara admin menyelesaikan selisih menurut arah (sama dengan server).
List<String> pilihanCara(String arah) => switch (arah) {
      'KURANG' => const ['HILANG', 'SUSULAN', 'SALAH_HITUNG'],
      'LEBIH' => const ['TAMBAHAN_MASUK', 'SALAH_CATAT', 'SALAH_HITUNG'],
      _ => const [],
    };

String labelCara(String cara) => const {
      'HILANG': 'MCB hilang (keluar dari stok)',
      'SUSULAN': 'Isi pemakaian susulan',
      'SALAH_HITUNG': 'Petugas salah hitung (dikembalikan)',
      'TAMBAHAN_MASUK': 'Tambahan masuk (tambah ke stok)',
      'SALAH_CATAT': 'Salah catat (stok tetap)',
    }[cara] ??
    cara;

const Map<String, String> labelMutasi = {
  'MASUK_GUDANG': 'Masuk gudang',
  'KIRIM_TIM': 'Kirim ke tim',
  'TARIK_TIM': 'Tarik ke gudang',
  'KOREKSI_GUDANG': 'Koreksi gudang',
  'KOREKSI_TIM': 'Koreksi tim',
  'PAKAI': 'Dipakai',
  'HILANG': 'Hilang',
  'TAMBAHAN': 'Tambahan masuk',
};

/// Satu baris selisih stok (Yandal dan admin).
class SelisihStok {
  const SelisihStok({
    required this.selisihId,
    required this.daya,
    required this.merk,
    required this.statusMcb,
    required this.jumlahPerkiraan,
    required this.jumlahInput,
    required this.selisih,
    required this.arah,
    required this.status,
    required this.caraPenyelesaian,
    this.timId = '',
    this.timNama = '',
    this.tanggal = '',
    this.shift = 0,
    this.catatanAdmin = '',
  });
  factory SelisihStok.dariJson(Map<String, dynamic> j) => SelisihStok(
        selisihId: _t(j['selisihId']),
        daya: _t(j['daya']),
        merk: _t(j['merk']),
        statusMcb: _t(j['statusMcb']),
        jumlahPerkiraan: _n(j['jumlahPerkiraan']),
        jumlahInput: _n(j['jumlahInput']),
        selisih: _n(j['selisih']),
        arah: _t(j['arah']),
        status: _t(j['status']),
        caraPenyelesaian: _t(j['caraPenyelesaian']),
        timId: _t(j['timId']),
        timNama: _t(j['timNama']),
        tanggal: _t(j['tanggal']),
        shift: _n(j['shift']),
        catatanAdmin: _t(j['catatanAdmin']),
      );
  final String selisihId, daya, merk, statusMcb, arah, status, caraPenyelesaian, timId, timNama, tanggal, catatanAdmin;
  final int jumlahPerkiraan, jumlahInput, selisih, shift;

  bool get menunggu => status == 'MENUNGGU';
  bool get kurang => arah == 'KURANG';

  /// 'Kurang 1: 2A Schneider Baru (perkiraan 2, dihitung 1)'
  String get teks =>
      '${kurang ? 'Kurang' : 'Lebih'} ${selisih.abs()}: ${teksDaya(daya)} $merk $statusMcb (perkiraan $jumlahPerkiraan, dihitung $jumlahInput)';
}

/// Jawaban getStokYandal: status pemeriksaan awal shift berjalan + saldo tim.
class StokYandal {
  const StokYandal({
    required this.tanggal,
    required this.noShift,
    required this.pemeriksaanId,
    required this.statusPemeriksaan,
    required this.selisih,
    required this.saldo,
    required this.bolehPakai,
    this.merkMcb = const [],
    this.keperluanMcb = const [],
  });
  factory StokYandal.dariJson(Map<String, dynamic> j) {
    final s = j['shift'] is Map<dynamic, dynamic> ? Map<String, dynamic>.from(j['shift'] as Map<dynamic, dynamic>) : <String, dynamic>{};
    final p = j['pemeriksaan'] is Map<dynamic, dynamic> ? Map<String, dynamic>.from(j['pemeriksaan'] as Map<dynamic, dynamic>) : null;
    return StokYandal(
      tanggal: _t(s['tanggal']),
      noShift: _n(s['no']),
      pemeriksaanId: p == null ? '' : _t(p['pemeriksaanId']),
      statusPemeriksaan: p == null ? null : _t(p['status']),
      selisih: p == null ? const [] : _peta(p['selisih']).map(SelisihStok.dariJson).toList(),
      saldo: _peta(j['saldo']).map(JenisMcb.dariJson).toList(),
      bolehPakai: j['bolehPakai'] == true,
      merkMcb: daftarMerk(j),
      keperluanMcb: daftarKeperluan(j),
    );
  }
  final String tanggal, pemeriksaanId;
  final int noShift;
  final String? statusPemeriksaan;
  final List<SelisihStok> selisih;
  final List<JenisMcb> saldo;
  final bool bolehPakai;

  /// Merk MCB dari master (db_Merk_MCB); kosong = master belum diisi, merk diketik bebas.
  final List<String> merkMcb;

  /// Keperluan penggunaan MCB dari master (db_Keperluan_MCB); kosong = master belum diisi, keperluan diketik bebas.
  final List<String> keperluanMcb;

  /// Petugas harus (atau boleh) mengisi pemeriksaan awal: belum ada, atau dikembalikan admin.
  bool get perluPeriksa => statusPemeriksaan == null || statusPemeriksaan == 'DIKEMBALIKAN';
  bool get menungguAdmin => statusPemeriksaan == 'MENUNGGU_ADMIN';
  List<SelisihStok> get selisihKurangMenunggu => selisih.where((s) => s.menunggu && s.kurang).toList();
}

List<String> _daftarTeks(Map<String, dynamic> j, String kunci) =>
    [for (final m in (j[kunci] is List ? j[kunci] as List : const [])) if (m is String && m.trim().isNotEmpty) m.trim()];

/// Merk MCB dari master di jawaban getIzinMaterial / getStokYandal (kunci merkMcb); salah bentuk = kosong (merk diketik bebas).
List<String> daftarMerk(Map<String, dynamic> j) => _daftarTeks(j, 'merkMcb');

/// Keperluan penggunaan MCB dari master (kunci keperluanMcb); salah bentuk = kosong (keperluan diketik bebas).
List<String> daftarKeperluan(Map<String, dynamic> j) => _daftarTeks(j, 'keperluanMcb');

/// Hasil simpanPemeriksaanStok.
class HasilPemeriksaan {
  const HasilPemeriksaan({required this.pemeriksaanId, required this.status, required this.selisih});
  factory HasilPemeriksaan.dariJson(Map<String, dynamic> j) =>
      HasilPemeriksaan(pemeriksaanId: _t(j['pemeriksaanId']), status: _t(j['status']), selisih: _peta(j['selisih']).map(SelisihStok.dariJson).toList());
  final String pemeriksaanId, status;
  final List<SelisihStok> selisih;
}

/// Isian satu pemakaian MCB (Yandal). [pemakaianId] dibuat sekali per form (kirim ulang tidak menggandakan).
class PemakaianBaru {
  const PemakaianBaru({required this.pemakaianId, required this.daya, required this.merk, required this.statusMcb, required this.nomorMeter, required this.keperluan, required this.fotoPath});
  final String pemakaianId, daya, merk, statusMcb, nomorMeter, keperluan, fotoPath;
}

/// Saldo gudang + tim (admin).
class TimStok {
  const TimStok({required this.timId, required this.nama, required this.stok, required this.tanpaIzin});
  factory TimStok.dariJson(Map<String, dynamic> j) =>
      TimStok(timId: _t(j['timId']), nama: _t(j['nama']), stok: _peta(j['stok']).map(JenisMcb.dariJson).toList(), tanpaIzin: _peta(j['tanpaIzin']).map(JenisMcb.dariJson).toList());
  final String timId, nama;
  final List<JenisMcb> stok, tanpaIzin;
}

class StokGudang {
  const StokGudang({required this.gudang, required this.tim, required this.mutasi});
  factory StokGudang.dariJson(Map<String, dynamic> j) =>
      StokGudang(gudang: _peta(j['gudang']).map(JenisMcb.dariJson).toList(), tim: _peta(j['tim']).map(TimStok.dariJson).toList(), mutasi: _peta(j['mutasi']));
  final List<JenisMcb> gudang;
  final List<TimStok> tim;
  final List<Map<String, dynamic>> mutasi;
}

/// Susun payload tambahStokGudang / kirimStokTim / tarikStokTim / koreksiStok dari isian form (nilai teks).
/// mode: tambah | kirim | tarik | koreksi. Hasil: data siap kirim, atau galat siap tampil. Server tetap memvalidasi ulang.
({Map<String, dynamic>? data, String? galat}) susunStok(String mode, Map<String, String> f, String idOperasi) {
  String v(String k) => (f[k] ?? '').trim();
  ({Map<String, dynamic>? data, String? galat}) salah(String m) => (data: null, galat: m);
  if (v('materialId').isEmpty) return salah('Pilih material.');
  if (v('daya').isEmpty || v('merk').isEmpty) return salah('Isi daya dan merk MCB.');
  if (mode == 'tambah' && !RegExp(r'^\d+$').hasMatch(v('daya'))) return salah('Daya harus angka (Ampere).');
  if (!statusMcb.contains(v('statusMcb'))) return salah('Pilih status MCB.');
  if ((mode == 'kirim' || mode == 'tarik') && v('timId').isEmpty) return salah('Pilih tim.');
  if (mode == 'koreksi' && v('lokasi').isEmpty) return salah('Pilih lokasi stok.');
  if ((mode == 'tarik' || mode == 'koreksi') && v('alasan').isEmpty) return salah('Isi alasan.');
  final galatAngka = galatJumlah(v(mode == 'koreksi' ? 'jumlahBaru' : 'jumlah'), min: mode == 'koreksi' ? 0 : 1);
  if (galatAngka != null) return salah(galatAngka);
  final d = <String, dynamic>{
    'idOperasi': idOperasi,
    if (mode == 'kirim' || mode == 'tarik') 'timId': v('timId'),
    if (mode == 'koreksi') 'lokasi': v('lokasi'),
    'materialId': v('materialId'),
    'daya': v('daya'),
    'merk': v('merk'),
    'statusMcb': v('statusMcb'),
    if (mode == 'koreksi') 'jumlahBaru': int.parse(v('jumlahBaru')) else 'jumlah': int.parse(v('jumlah')),
    if (mode == 'tarik' || mode == 'koreksi') 'alasan': v('alasan') else if (v('catatan').isNotEmpty) 'catatan': v('catatan'),
  };
  return (data: d, galat: null);
}
