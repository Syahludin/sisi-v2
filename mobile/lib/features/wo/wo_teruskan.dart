import '../../core/sesi.dart';
import 'wo_bantu.dart';
import 'wo_penerusan.dart';
import 'wo_sinkron.dart';

/// Menu yang berhak meneruskan WO (sama dengan WoAdminScreen.menu).
const menuTeruskanWo = 'OPS_PENERUSAN_WO';

/// v1.0.58: tombol "Teruskan ke tim" di daftar Temuan Inspeksi. Hanya sesi dengan UBAH di OPS_PENERUSAN_WO dan temuan
/// yang belum diteruskan (server tetap pemutus akhir: teruskanWo butuh menu itu dan menolak WO yang sudah berjalan).
bool bolehTeruskanDariDaftar(Sesi sesi, Map<String, dynamic> t) =>
    sesi.bisaUbah(menuTeruskanWo) && statusWoDari(t).isEmpty && petaWo(t['wo'])['ganda'] != true;

/// v1.0.58: keterangan kartu "Data berhasil disimpan" sesudah teruskan / pindah / tarik WO dimasukkan ke antrean latar.
String keteranganKirimWo(String kode, String tim, {bool pindah = false, bool ditarik = false}) {
  final k = kode.isEmpty ? 'WO' : kode;
  if (ditarik) return '$k ditarik dari $tim.';
  return pindah ? '$k dipindah ke $tim.' : '$k diteruskan ke $tim.';
}

/// Daftar tim tujuan (ROW / Hartek / Yandal aktif) untuk pemilih tim. Dibaca dari simpanan Penerusan WO (kunci tanpa rentang
/// tanggal, sama dengan WoAdminScreen); kosong = satu sinkron getWoAdmin (butuh sinyal, galat dilempar ke pemanggil).
Future<List<Map<String, dynamic>>> timTujuanWo({
  required String userId,
  required Future<Map<String, dynamic>> Function(String aksi, Map<String, dynamic> data) api,
  StoreWo store = const StoreWo(),
}) async {
  final kunci = '$userId|admin';
  final lokal = await store.baca(kunci);
  final tim = daftarWo(lokal?.data['tim']);
  if (tim.isNotEmpty) return tim;
  final h = await sinkronDaftarWo(kunci: kunci, aksi: 'getWoAdmin', param: const {}, api: api, store: store);
  return daftarWo(h.data['tim']);
}

/// Teruskan (atau [pindah]) satu WO lewat antrean latar [PenerusanWo]: dikirim berurutan, dicoba ulang saat sinyal pulih,
/// disimpan ke file sampai berhasil. Dipakai layar Penerusan WO / Pindah Tim TO dan daftar Temuan Inspeksi.
/// [selesai] dipanggil sesudah satu percobaan (true = berhasil).
void teruskanWoKeAntre({
  required String userId,
  required Future<Map<String, dynamic>> Function(String aksi, Map<String, dynamic> data) api,
  required Map<String, dynamic> temuan,
  required String timId,
  required String namaTim,
  required String catatan,
  bool pindah = false,
  void Function(bool berhasil)? selesai,
}) {
  final id = teksWo(temuan['temuanId']);
  final rev = num.tryParse(teksWo(temuan['revision']))?.toInt() ?? 1;
  final aksi = pindah ? 'pindahWo' : 'teruskanWo';
  final data = <String, dynamic>{'temuanId': id, 'timId': timId, if (catatan.isNotEmpty) 'catatan': catatan, 'revision': rev};
  PenerusanWo.i.tambah(ItemPenerusanWo(
    temuanId: id,
    kode: teksWo(temuan['kodeTemuan']),
    judul: pindah ? 'Dipindah ke $namaTim' : 'Diteruskan ke $namaTim',
    aksi: aksi,
    data: data,
    userId: userId,
    kirim: () => api(aksi, data),
    selesai: selesai,
  ));
}
