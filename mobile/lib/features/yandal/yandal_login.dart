/// v0.63.0 (keputusan Master Guswan 7 Okt 2026): login akun tim YANDAL 2 tahap. Pure Dart, bisa dites tanpa Flutter.
///
/// Tahap 1 (login) memberi [TiketYandal]: daftar petugas tim (db_Petugas.tim), shift saat ini, dan crew yang
/// sudah dipilih HP lain (kalau shift sudah dimulai). Tahap 2 (mulaiShiftYandal) memakai tiket + 1-2 petugas.
class PetugasPilih {
  const PetugasPilih({required this.petugasId, required this.nama, this.sibuk = false});

  final String petugasId;
  final String nama;

  /// Sedang bertugas di tim lain pada shift yang sama (tidak bisa dipilih).
  final bool sibuk;

  factory PetugasPilih.dariJson(Map<String, dynamic> j) =>
      PetugasPilih(petugasId: '${j['petugasId']}', nama: '${j['nama'] ?? ''}', sibuk: j['sibuk'] == true);
}

class TiketYandal {
  const TiketYandal({
    required this.tiket,
    required this.timNama,
    required this.shiftNo,
    required this.tanggal,
    required this.hari,
    required this.jamShift,
    required this.sampai,
    required this.petugas,
    required this.terpilih,
    this.maks = 2,
  });

  final String tiket;
  final String timNama;
  final int shiftNo;
  final String tanggal;
  final String hari;
  final String jamShift;
  final DateTime? sampai;
  final List<PetugasPilih> petugas;

  /// Shift sudah dimulai HP lain: crew dikunci, HP ini cukup konfirmasi.
  final List<String> terpilih;
  final int maks;

  bool get crewTerkunci => terpilih.isNotEmpty;

  factory TiketYandal.dariJson(Map<String, dynamic> d) {
    final y = Map<String, dynamic>.from(d['yandal'] as Map<dynamic, dynamic>);
    final tim = Map<String, dynamic>.from(y['tim'] as Map<dynamic, dynamic>);
    final sh = Map<String, dynamic>.from(y['shift'] as Map<dynamic, dynamic>);
    return TiketYandal(
      tiket: d['tiket'] as String,
      timNama: '${tim['nama'] ?? ''}',
      shiftNo: (sh['no'] as num).toInt(),
      tanggal: '${sh['tanggal'] ?? ''}',
      hari: '${sh['hari'] ?? ''}',
      jamShift: '${sh['jam'] ?? ''}',
      sampai: DateTime.tryParse('${sh['sampai'] ?? ''}'),
      petugas: [
        for (final p in (y['petugas'] as List<dynamic>? ?? const <dynamic>[]).whereType<Map<dynamic, dynamic>>())
          PetugasPilih.dariJson(Map<String, dynamic>.from(p)),
      ],
      terpilih: [for (final t in (y['terpilih'] as List<dynamic>? ?? const <dynamic>[])) '$t'],
      maks: (y['maks'] as num?)?.toInt() ?? 2,
    );
  }

  /// Nama petugas untuk id terpilih, urut [ids].
  List<String> namaDari(List<String> ids) => [
        for (final id in ids)
          for (final p in petugas)
            if (p.petugasId == id) p.nama,
      ];
}

/// Teks verifikasi sebelum masuk (keputusan Master Guswan 7 Okt 2026).
String teksKonfirmasiPetugas(List<String> nama) {
  final b = StringBuffer('Apakah user yang masuk saat ini adalah\n');
  for (var i = 0; i < nama.length; i++) {
    b.writeln('${i + 1}. ${nama[i]}');
  }
  b.write('Jika sudah betul silahkan lanjut login');
  return b.toString();
}

/// v0.65.11: inisial avatar kartu verifikasi: dua huruf depan kata pertama & kedua ("Wintoh Febby H. S" = "WF"),
/// satu kata = dua huruf pertama ("Anwar" = "AN"). Kosong = "?".
String inisialPetugas(String nama) {
  final k = nama.trim().split(RegExp(r'\s+')).where((x) => RegExp(r'[A-Za-z0-9]').hasMatch(x)).toList();
  if (k.isEmpty) return '?';
  String huruf(String x) => x.replaceAll(RegExp(r'[^A-Za-z0-9]'), '');
  if (k.length == 1) {
    final h = huruf(k.first);
    return (h.length >= 2 ? h.substring(0, 2) : h).toUpperCase();
  }
  return (huruf(k[0]).substring(0, 1) + huruf(k[1]).substring(0, 1)).toUpperCase();
}

/// Pilihan berikutnya saat petugas [id] diketuk: tambah (maks [maks]) / lepas. null = sudah penuh.
List<String>? togglePetugas(List<String> dipilih, String id, int maks) {
  if (dipilih.contains(id)) return [for (final x in dipilih) if (x != id) x];
  if (dipilih.length >= maks) return null;
  return [...dipilih, id];
}

/// "HH:mm" WIB dari waktu absolut.
String jamWib(DateTime t) {
  final w = t.toUtc().add(const Duration(hours: 7));
  String dua(int n) => n.toString().padLeft(2, '0');
  return '${dua(w.hour)}:${dua(w.minute)}';
}
