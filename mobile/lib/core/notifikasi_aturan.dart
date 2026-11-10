import 'sesi.dart';

/// v0.83.0: aturan pendaftaran notifikasi push (murni, dites tanpa Firebase).
/// v1.0.45: penerima hanya ADMIN / SUPER (tim Yandal belum login, sekali per shift). HP petugas tidak didaftarkan.
/// Sama dengan penerimaNotif_ server.
bool perluNotifikasi(Sesi s) => s.role == 'ADMIN' || s.role == 'SUPER';

/// v1.0.29: data notifikasi push yang diketuk -> item lonceng (layar tujuan sama dengan item lonceng). null = jenis tanpa
/// layar tujuan (mis. pengingat login).
Map<String, dynamic>? itemLoncengDariPush(Map<String, dynamic> d) {
  final jenis = '${d['jenis'] ?? ''}';
  if (!const {'WO', 'TEMUAN', 'P0'}.contains(jenis)) return null;
  return {
    'jenis': jenis,
    'kunci': '',
    'tujuan': {
      for (final k in const ['menu', 'temuanId', 'tanggal'])
        if ('${d[k] ?? ''}'.trim().isNotEmpty) k: '${d[k]}'.trim(),
    },
  };
}

/// Daftar ulang ke server paling lambat tiap 3 hari walau token sama (server menandai HP yang masih hidup).
const Duration jedaDaftarUlangNotif = Duration(days: 3);

/// Nilai yang disimpan sesudah berhasil daftar: `userId|token|ms`.
String catatanDaftarNotif(String userId, String token, DateTime waktu) => '$userId|$token|${waktu.millisecondsSinceEpoch}';

/// Perlu kirim daftarNotif? Belum pernah, akun / token berubah, atau sudah lewat [jedaDaftarUlangNotif].
bool perluDaftarNotif(String? catatan, String userId, String token, DateTime sekarang) {
  if (catatan == null || catatan.isEmpty) return true;
  final i = catatan.lastIndexOf('|');
  if (i <= 0) return true;
  if (catatan.substring(0, i) != '$userId|$token') return true;
  final ms = int.tryParse(catatan.substring(i + 1));
  if (ms == null) return true;
  return sekarang.difference(DateTime.fromMillisecondsSinceEpoch(ms)) >= jedaDaftarUlangNotif;
}
