import 'sesi.dart';

/// v0.83.0: aturan pendaftaran notifikasi push (murni, dites tanpa Firebase).
/// Penerima: akun tim YANDAL (pengingat login shift) dan ADMIN / SUPER (peringatan tim belum login 1 jam).
bool perluNotifikasi(Sesi s) => s.petugasYandal || s.role == 'ADMIN' || s.role == 'SUPER';

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
