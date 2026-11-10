import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';

import '../../core/api_client.dart';
import '../../core/gps.dart';
import '../../core/kode_error.dart';
import '../../theme/app_colors.dart';
import '../row/watermark.dart';
import '../../widgets/sisi_loader.dart';

/// v0.72.0 (perbaikan Master Guswan 9 Okt 2026): bantuan form BA Gardu (kVA dropdown, cek angka, akurasi GPS, watermark,
/// dialog progres simpan). Fungsi murni di atas bisa dites tanpa HP.

/// Merk trafo (sama v1 BA_MERK_TRAFO). "Lainnya" = ketik sendiri.
const merkTrafoBa = <String>[
  'Alsthom Atlantique', 'Amtra Electric', 'B&D', 'Centrado', 'J&P', 'Lucky Light', 'Mastergreen', 'Maxima', 'Monata', 'Morawa',
  'Trafindo', 'Trafoindo', 'Triputra Electric Abadi', 'Schneider', 'Shenyang', 'Sintra', 'Starlite', 'Unindo', 'Voltra', 'Weltraf',
];

/// Kapasitas trafo distribusi umum (kVA). Ditambah nilai yang ada di Master Gardu.
const kvaStandarBa = <int>[25, 50, 100, 160, 200, 250, 315, 400, 500, 630, 800, 1000];

/// Pilihan dropdown kVA: standar + kVA bulat dari Master Gardu (1-5000), urut naik, tanpa ganda.
List<int> pilihanKvaBa(Iterable<double?> master) {
  final s = <int>{...kvaStandarBa};
  for (final k in master) {
    if (k != null && k >= 1 && k <= 5000 && k == k.roundToDouble()) s.add(k.toInt());
  }
  return s.toList()..sort();
}

/// Angka isian HP: koma = titik, kosong / "-" = tidak diisi. null = bukan angka.
num? angkaIsianBa(String? v) {
  final s = (v ?? '').trim().replaceAll(',', '.');
  if (s.isEmpty || s == '-') return null;
  return num.tryParse(s);
}

bool kosongIsianBa(String? v) {
  final s = (v ?? '').trim();
  return s.isEmpty || s == '-';
}

/// Cek angka sama dengan server (validasi_ tipe angka). null = sah, selain itu pesan.
String? cekAngkaBa(String? v, {required num min, required num max, bool wajib = true, bool bulat = false}) {
  if (kosongIsianBa(v)) return wajib ? 'Wajib diisi' : null;
  final n = angkaIsianBa(v);
  if (n == null) return 'Harus angka';
  if (bulat && n != n.roundToDouble()) return 'Harus angka bulat';
  if (n < min || n > max) return 'Harus $min sampai $max';
  return null;
}

/// Nama isian (kunci server simpanBaGardu) -> label di form.
const labelKolomBa = <String, String>{
  'kva': 'Kapasitas (kVA)', 'merk': 'Merk', 'seri': 'Nomor Seri', 'tahun': 'Tahun trafo', 'konstruksi': 'Konstruksi',
  'koordinat': 'Koordinat Trafo', 'jurusan': 'Jurusan Terpasang', 'alamat': 'Alamat', 'merkPhb': 'Merk PHB-TR',
  'seriPhb': 'Nomor Seri PHB-TR', 'tahunPhb': 'Tahun PHB-TR', 'kepemilikan': 'Kepemilikan', 'perluasanSutm': 'Panjang Perluasan SUTM',
  'vendor': 'Vendor Pekerja', 'catatan': 'Catatan', 'tanggalBa': 'Tanggal BA', 'tanggalPekerjaan': 'Tanggal Pekerjaan',
  'garduId': 'Gardu', 'kvaSesudah': 'Kapasitas Sesudah (kVA)', 'merkSesudah': 'Merk Sesudah',
  'seriSesudah': 'Nomor Seri Sesudah', 'tahunSesudah': 'Tahun Sesudah', 'asalTrafo': 'Asal Trafo',
  'merkPhbSesudah': 'Merk PHB-TR Sesudah', 'seriPhbSesudah': 'Nomor Seri PHB-TR Sesudah',
  'tahunPhbSesudah': 'Tahun PHB-TR Sesudah', 'jurusanSesudah': 'Jumlah Jurusan Sesudah',
};

/// Pesan gagal simpan: error validasi server menyebut isian yang salah (v0.72.0, jawaban server membawa `kolom`).
String pesanApiBa(ApiException e) {
  final k = e.kolom;
  if (k == null) return KodeError.pesan(e.kode);
  final label = labelKolomBa[k] ?? k;
  final alasan = switch (e.kode) {
    'DI_LUAR_RENTANG' => 'di luar batas yang diizinkan',
    'HARUS_BULAT' => 'harus angka bulat',
    'TERLALU_PANJANG' => 'terlalu panjang',
    'FIELD_WAJIB' => 'wajib diisi',
    'PILIHAN_TIDAK_VALID' => 'pilihannya tidak dikenal server (update app)',
    _ => 'formatnya tidak sesuai',
  };
  return 'Isian "$label" $alasan. Perbaiki lalu ketuk Simpan lagi.';
}

/// Tingkat akurasi GPS (sama ambang kamera ROW): <= 5 m bagus, <= 15 m sedang, lebih = lemah.
({String teks, Color warna, Color latar}) akurasiBa(double m) {
  final teks = 'GPS ±${m.toStringAsFixed(m < 10 ? 1 : 0)} m';
  if (m <= Gps.target) return (teks: '$teks · bagus', warna: AppColors.success700, latar: AppColors.success100);
  if (m <= Gps.sedang) return (teks: '$teks · sedang', warna: AppColors.accent700, latar: AppColors.accent100);
  return (teks: '$teks · lemah', warna: AppColors.red700, latar: AppColors.red100);
}

/// Isi watermark foto kamera BA (permintaan Master Guswan): No Gardu, bagian foto, tanggal-jam, koordinat.
/// akurasiM ada = koordinat dari GPS (±m), null = koordinat diketik di form ("input").
DataWatermark watermarkBa({
  required String ulp,
  required String jenisBa,
  required String noGardu,
  required String bagian,
  required DateTime waktu,
  String? koordinat,
  double? akurasiM,
}) {
  final k = (koordinat ?? '').trim();
  final teksKoordinat = k.isEmpty ? '-' : (akurasiM == null ? '$k (input)' : '$k (±${akurasiM.toStringAsFixed(0)} m)');
  return DataWatermark(
    kodeEksekusi: noGardu,
    ulp: ulp,
    tim: '',
    subTim: '',
    penyulang: null,
    section: null,
    waktu: waktu,
    koordinat: k,
    akurasiM: akurasiM,
    diameter: null,
    jenis: jenisBa,
    slot: bagian,
    judulKhusus: 'BA $jenisBa',
    barisKhusus: [
      ('No Gardu', noGardu.trim().isEmpty ? '-' : noGardu.trim()),
      ('Foto', bagian),
      ('Tanggal', DataWatermark.formatWaktu(waktu)),
      ('Koordinat', teksKoordinat),
    ],
  );
}

/// Bakar watermark ke foto kamera (rasio foto apa adanya: potret / lanskap). Hasil = path file JPEG baru.
Future<String> pasangWatermarkBa(String pathAsli, DataWatermark d, String nama) async {
  final asli = await File(pathAsli).readAsBytes();
  final jadi = await Watermark.pasang(asli, d);
  final dir = await getTemporaryDirectory();
  final f = File('${dir.path}/ba_wm_${nama}_${DateTime.now().millisecondsSinceEpoch}.jpg');
  await f.writeAsBytes(jadi, flush: true);
  return f.path;
}

// == progres simpan ==

enum StatusLangkah { tunggu, jalan, selesai, lewat, peringatan, gagal }

class LangkahSimpan {
  LangkahSimpan(this.judul, {this.ikon = Icons.circle_outlined, this.gambar});
  final String judul;
  final IconData ikon;
  final String? gambar; // thumbnail foto
  StatusLangkah status = StatusLangkah.tunggu;
  String? ket;
}

/// Status dialog simpan BA: langkah foto 1..n, simpan BA, buat PDF. Gagal = dialog tetap terbuka dengan pesan.
class ProgresSimpanBa extends ChangeNotifier {
  ProgresSimpanBa(this.langkah);
  final List<LangkahSimpan> langkah;
  String? galat;

  void atur(int i, StatusLangkah s, {String? ket}) {
    langkah[i].status = s;
    langkah[i].ket = ket;
    notifyListeners();
  }

  void gagal(int i, String pesan) {
    langkah[i].status = StatusLangkah.gagal;
    langkah[i].ket = 'Gagal';
    galat = pesan;
    notifyListeners();
  }

  double get rasio {
    if (langkah.isEmpty) return 0;
    var n = 0.0;
    for (final l in langkah) {
      if (l.status == StatusLangkah.selesai || l.status == StatusLangkah.lewat || l.status == StatusLangkah.peringatan) n += 1;
      if (l.status == StatusLangkah.jalan) n += .4;
    }
    return (n / langkah.length).clamp(0, 1).toDouble();
  }
}

class DialogProgresBa extends StatelessWidget {
  const DialogProgresBa({super.key, required this.progres});
  final ProgresSimpanBa progres;

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: progres,
        builder: (c, _) {
          final g = progres.galat;
          final persen = (progres.rasio * 100).round();
          return PopScope(
            canPop: g != null,
            child: AlertDialog(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
              titlePadding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
              contentPadding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              title: Row(children: [
                Icon(g == null ? Icons.cloud_upload_rounded : Icons.error_outline_rounded, color: g == null ? AppColors.brand600 : AppColors.red600),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(g == null ? 'Menyimpan Berita Acara' : 'Penyimpanan terhenti',
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.navy900)),
                ),
                Text('$persen%', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.neutral500)),
              ]),
              content: SizedBox(
                width: double.maxFinite,
                child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: TweenAnimationBuilder<double>(
                      tween: Tween(end: progres.rasio),
                      duration: const Duration(milliseconds: 350),
                      builder: (c, v, _) => LinearProgressIndicator(
                        value: v,
                        minHeight: 7,
                        backgroundColor: AppColors.neutral100,
                        color: g == null ? AppColors.success600 : AppColors.red600,
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Flexible(
                    child: ListView(shrinkWrap: true, children: [for (final l in progres.langkah) _BarisLangkah(l)]),
                  ),
                  if (g != null) ...[
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(color: AppColors.red100, borderRadius: BorderRadius.circular(12)),
                      child: Text(g, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.red700)),
                    ),
                    const SizedBox(height: 4),
                    const Text('Foto yang sudah terkirim tidak dikirim ulang. Perbaiki lalu ketuk Simpan lagi.',
                        style: TextStyle(fontSize: 11, color: AppColors.neutral500)),
                  ] else
                    const Padding(
                      padding: EdgeInsets.only(top: 6),
                      child: Text('Jangan tutup aplikasi sampai selesai.', style: TextStyle(fontSize: 11, color: AppColors.neutral500)),
                    ),
                ]),
              ),
              actions: [if (g != null) FilledButton(onPressed: () => Navigator.pop(c), child: const Text('Tutup'))],
            ),
          );
        },
      );
}

class _BarisLangkah extends StatelessWidget {
  const _BarisLangkah(this.l);
  final LangkahSimpan l;

  @override
  Widget build(BuildContext context) {
    final (Widget ikon, Color warna) = switch (l.status) {
      StatusLangkah.jalan => (const SisiLoader(ukuran: 18), AppColors.brand600),
      StatusLangkah.selesai => (const Icon(Icons.check_circle_rounded, color: AppColors.success600, size: 20), AppColors.success700),
      StatusLangkah.lewat => (const Icon(Icons.check_circle_outline_rounded, color: AppColors.success600, size: 20), AppColors.success700),
      StatusLangkah.peringatan => (const Icon(Icons.warning_amber_rounded, color: AppColors.accent600, size: 20), AppColors.accent700),
      StatusLangkah.gagal => (const Icon(Icons.cancel_rounded, color: AppColors.red600, size: 20), AppColors.red700),
      StatusLangkah.tunggu => (const Icon(Icons.schedule_rounded, color: AppColors.neutral300, size: 20), AppColors.neutral400),
    };
    final aktif = l.status == StatusLangkah.jalan;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 250),
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        color: aktif ? AppColors.brand50 : Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: aktif ? AppColors.brand100 : Colors.transparent),
      ),
      child: Row(children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: SizedBox(
            width: 38,
            height: 38,
            child: l.gambar != null
                ? Image.file(File(l.gambar!), fit: BoxFit.cover, cacheWidth: 120)
                : ColoredBox(color: AppColors.neutral100, child: Icon(l.ikon, size: 20, color: AppColors.navy700)),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(l.judul, style: TextStyle(fontSize: 13, fontWeight: aktif ? FontWeight.w800 : FontWeight.w600, color: AppColors.navy900)),
            if (l.ket != null) Text(l.ket!, style: TextStyle(fontSize: 11, color: warna, fontWeight: FontWeight.w600)),
          ]),
        ),
        ikon,
      ]),
    );
  }
}
