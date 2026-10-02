/// Diameter -> jenis pekerjaan (PRD F-ROW-INPUT). Sama persis dengan klasifikasiJenis_ di backend.
/// Batas dibaca dari master (getMaster > jenisPekerjaan), bukan ditulis di kode.
/// Isi awal master: Rabas / Pangkas 0, Tebang Sedang 25-50, Tebang Besar 51+ (cm, bilangan bulat, inklusif).
class JenisPekerjaan {
  JenisPekerjaan({
    required this.id,
    required this.nama,
    required this.satuan,
    this.diameterMin,
    this.diameterMax,
    this.aktif = true,
    this.modul = 'ROW',
  });

  final String id;
  final String nama;
  final String satuan;
  final num? diameterMin;
  final num? diameterMax;
  final bool aktif;
  final String modul;

  static JenisPekerjaan dariMaster(Map<String, dynamic> m) => JenisPekerjaan(
        id: m['id'] as String,
        nama: m['nama'] as String,
        satuan: (m['satuan'] as String?) ?? '',
        diameterMin: m['diameterMin'] as num?,
        diameterMax: m['diameterMax'] as num?,
        aktif: m['aktif'] == true,
        modul: (m['modul'] as String?) ?? 'ROW',
      );

  bool cocok(int diameter) {
    if (!aktif || modul != 'ROW') return false;
    if (diameterMin == null && diameterMax == null) return false;
    return (diameterMin == null || diameter >= diameterMin!) && (diameterMax == null || diameter <= diameterMax!);
  }
}

class HasilJenis {
  HasilJenis.ok(JenisPekerjaan this.jenis) : kode = null;
  HasilJenis.tolak(String this.kode) : jenis = null;
  final JenisPekerjaan? jenis;
  final String? kode; // DIAMETER_TIDAK_VALID | DIAMETER_DI_LUAR_KATEGORI | JENIS_AMBIGU
  bool get ok => jenis != null;
}

HasilJenis pilihJenis(int diameter, List<JenisPekerjaan> daftar) {
  if (diameter < 0 || diameter > 1000) return HasilJenis.tolak('DIAMETER_TIDAK_VALID');
  final cocok = daftar.where((j) => j.cocok(diameter)).toList();
  if (cocok.length > 1) return HasilJenis.tolak('JENIS_AMBIGU');
  if (cocok.isEmpty) return HasilJenis.tolak('DIAMETER_DI_LUAR_KATEGORI');
  return HasilJenis.ok(cocok.first);
}
