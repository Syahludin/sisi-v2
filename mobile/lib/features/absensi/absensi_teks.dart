/// v1.0.51 Teks WhatsApp absensi dibuat LOKAL di HP, tanpa menunggu server (permintaan Master Guswan 1 Nov 2026).
/// Harus SAMA PERSIS dengan teksWa_ di backend/src/modules/66_Absensi.js (tes membandingkan contoh yang sama, legenda,
/// dan simbol status langsung dari berkas backend). Dasar hitungan = rekap bulan dari server (sudah termasuk isian hari ini
/// menurut server); perubahan lokal (pilihan belum disimpan, antrean HP) menggeser hitungan hari ini.
library;

import 'absensi_model.dart';

/// Sama dengan ABS_LEGENDA_ di backend.
const legendaAbsensi = <String>[
  '*Note/Catatan:*',
  '✅ Hadir Tepat Waktu',
  '❌ Tidak Hadir tanpa Keterangan',
  '*️⃣ Hadir Namun Telat',
  '📌 Tidak hadir dengan keterangan',
  '🇨🇭 TMK - sakit dgn SKS',
  '🆓 Cuti kerja',
  '🔤 Izin tdk masuk kerja (sakit tanpa SKS, atau izin di luar izin resmi perusahaan)',
  '🚷 Absen/Tidak masuk kerja tanpa keterangan',
  '⏳ Belum diabsen',
];

/// Urutan simbol di teks (sama dengan ABS_URUTAN_SIMBOL_ di backend). HADIR tidak dihitung: hanya penanda hari ini.
const _urutanSimbol = [
  StatusAbsensi.tmk,
  StatusAbsensi.cuti,
  StatusAbsensi.izin,
  StatusAbsensi.ket,
  StatusAbsensi.telat,
  StatusAbsensi.tanpaKet,
  StatusAbsensi.absen,
];

const _hari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const _bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

/// '2026-11-02' -> 'Senin, 2 November 2026'. Tidak valid = teks apa adanya.
String tglIndoAbsensi(String iso) {
  final p = iso.split('-');
  if (p.length != 3) return iso;
  final y = int.tryParse(p[0]), m = int.tryParse(p[1]), d = int.tryParse(p[2]);
  if (y == null || m == null || d == null || m < 1 || m > 12) return iso;
  return '${_hari[DateTime.utc(y, m, d).weekday % 7]}, $d ${_bulan[m - 1]} $y';
}

/// Status yang berlaku untuk satu petugas di teks (server + antrean HP + pilihan sesi ini).
class IsianStaf {
  const IsianStaf(this.staf, this.status, this.keterangan);
  final StafAbsensi staf;
  final StatusAbsensi? status;
  final String keterangan;
}

/// [isian] harus berurutan seperti dari server (per tim, nama A-Z); [tim] = urutan tampil.
String teksWaAbsensi({
  required String tanggal,
  required String jamSimpan,
  required List<TimAbsensi> tim,
  required List<IsianStaf> isian,
  required Map<String, Map<StatusAbsensi, int>> rekapServer,
}) {
  final y = tanggal.length >= 4 ? tanggal.substring(0, 4) : tanggal;
  final m = int.tryParse(tanggal.length >= 7 ? tanggal.substring(5, 7) : '') ?? 1;
  final baris = <String>[
    '*Absensi kehadiran safety breafing ${_bulan[(m - 1).clamp(0, 11)]} $y*',
    tglIndoAbsensi(tanggal),
    'Pukul : $jamSimpan WIB',
  ];

  int jumlah(IsianStaf x, StatusAbsensi k) {
    var n = rekapServer[x.staf.petugasId]?[k] ?? 0;
    if (x.staf.status == k) n--; // isian hari ini menurut server sudah ikut terhitung
    if (x.status == k) n++; // isian hari ini yang berlaku sekarang
    return n < 0 ? 0 : n;
  }

  for (final t in tim) {
    final isi = <String>[];
    for (final x in isian.where((x) => x.staf.timId == t.timId)) {
      if (x.status == null && t.jenis == 'YANDAL') continue; // bisa jadi bukan shift pagi
      final bagian = <String>['* ${x.staf.nama.trim()}'];
      for (final k in _urutanSimbol) {
        final n = jumlah(x, k);
        if (n > 0) bagian.add('${k.simbol}$n');
      }
      if (x.status == null) {
        bagian.add('⏳ belum diabsen');
      } else {
        if (x.status == StatusAbsensi.hadir) bagian.add(StatusAbsensi.hadir.simbol);
        if (x.keterangan.trim().isNotEmpty) bagian.add(x.keterangan.trim());
      }
      isi.add(bagian.join(' '));
    }
    if (isi.isNotEmpty) baris..add('*${t.nama}*')..addAll(isi);
  }
  return [...baris, ...legendaAbsensi].join('\n');
}
