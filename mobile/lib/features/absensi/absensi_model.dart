/// v1.0.51 Absensi safety briefing: model data dari server (getAbsensi) dan isian yang dikirim (simpanAbsensi).
/// Pure Dart. Kode status HARUS sama dengan ABS_STATUS_ di backend/src/modules/66_Absensi.js.
library;

enum StatusAbsensi {
  hadir('HADIR', '✅', 'Hadir Tepat Waktu'),
  telat('TELAT', '*️⃣', 'Hadir Telat'),
  tanpaKet('TANPA_KET', '❌', 'Tidak Hadir Tanpa Keterangan'),
  absen('ABSEN', '🚷', 'Absen/Tidak masuk kerja tanpa keterangan'),
  ket('KET', '📌', 'Tidak Hadir dengan Keterangan', wajibKeterangan: true),
  tmk('TMK', '🇨🇭', 'TMK, sakit dengan SKS'),
  cuti('CUTI', '🆓', 'Cuti kerja'),
  izin('IZIN', '🔤', 'Izin tidak masuk kerja', wajibKeterangan: true);

  const StatusAbsensi(this.kode, this.simbol, this.label, {this.wajibKeterangan = false});

  final String kode;
  final String simbol;
  final String label;

  /// Alasan wajib diisi (maks 200 karakter) dan hanya untuk status ini.
  final bool wajibKeterangan;

  static StatusAbsensi? dariKode(Object? kode) {
    for (final s in values) {
      if (s.kode == kode) return s;
    }
    return null;
  }
}

/// Isian satu staf yang dipilih pengabsen.
class IsianAbsensi {
  const IsianAbsensi(this.status, [this.keterangan = '']);
  final StatusAbsensi status;
  final String keterangan;

  /// Isian siap kirim: keterangan hanya untuk status yang mewajibkannya.
  Map<String, dynamic> keJson(String petugasId) => {
        'petugasId': petugasId,
        'status': status.kode,
        if (status.wajibKeterangan) 'keterangan': keterangan.trim(),
      };
}

class TimAbsensi {
  const TimAbsensi({required this.timId, required this.nama, required this.jenis});
  final String timId;
  final String nama;
  final String jenis;
}

class StafAbsensi {
  const StafAbsensi({
    required this.petugasId,
    required this.nama,
    required this.timId,
    this.status,
    this.keterangan = '',
    this.diabsenOlehNama = '',
    this.milikSaya = false,
  });
  final String petugasId;
  final String nama;
  final String timId;

  /// null = belum diabsen siapa pun.
  final StatusAbsensi? status;
  final String keterangan;
  final String diabsenOlehNama;
  final bool milikSaya;

  /// Sudah diisi akun lain: tidak bisa diubah (server menolak juga).
  bool get terkunci => status != null && !milikSaya;

  factory StafAbsensi.dariJson(Map<String, dynamic> j) {
    final oleh = j['diabsenOleh'];
    return StafAbsensi(
      petugasId: '${j['petugasId']}',
      nama: '${j['nama'] ?? ''}',
      timId: '${j['timId'] ?? ''}',
      status: StatusAbsensi.dariKode(j['status']),
      keterangan: '${j['keterangan'] ?? ''}',
      diabsenOlehNama: oleh is Map ? '${oleh['nama'] ?? ''}' : '',
      milikSaya: j['milikSaya'] == true,
    );
  }
}

class DataAbsensi {
  const DataAbsensi({required this.tanggal, this.tim = const [], this.staf = const [], this.jamSimpan = '', this.teksWa = '', this.rekap = const {}});
  final String tanggal;
  final List<TimAbsensi> tim;
  final List<StafAbsensi> staf;
  final String jamSimpan;
  final String teksWa;

  /// Rekap bulan berjalan per petugas dari server (sudah termasuk isian hari ini menurut server). Dasar teks WA lokal.
  final Map<String, Map<StatusAbsensi, int>> rekap;

  List<StafAbsensi> stafDi(String timId) => [for (final s in staf) if (s.timId == timId) s];

  factory DataAbsensi.dariJson(Map<String, dynamic> d) => DataAbsensi(
        tanggal: '${d['tanggal']}',
        jamSimpan: '${d['jamSimpan'] ?? ''}',
        teksWa: '${d['teksWa'] ?? ''}',
        rekap: {
          for (final e in (d['rekap'] as Map<dynamic, dynamic>? ?? const <dynamic, dynamic>{}).entries)
            if (e.value is Map)
              '${e.key}': {
                for (final st in StatusAbsensi.values)
                  if ((e.value as Map)[st.kode] is num) st: ((e.value as Map)[st.kode] as num).toInt(),
              },
        },
        tim: [
          for (final t in (d['tim'] as List<dynamic>? ?? const <dynamic>[]).whereType<Map<dynamic, dynamic>>())
            TimAbsensi(timId: '${t['timId']}', nama: '${t['nama'] ?? ''}', jenis: '${t['jenis'] ?? ''}'),
        ],
        staf: [
          for (final s in (d['staf'] as List<dynamic>? ?? const <dynamic>[]).whereType<Map<dynamic, dynamic>>())
            StafAbsensi.dariJson(Map<String, dynamic>.from(s)),
        ],
      );
}
