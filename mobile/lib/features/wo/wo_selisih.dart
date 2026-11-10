import 'wo_bantu.dart';

/// v1.0.58: daftar WO admin disimpan lengkap di HP; server hanya mengirim temuan yang berubah (getWoAdmin { sejak }).
/// Fungsi murni: menggabung selisih ke data lokal dan menyaring status di HP (aturan sama dengan getWoAdmin_ di backend
/// 56_TindakLanjut.js). Pasangannya di web: web/src/selisihWo.js.

/// tanggal turun, lalu kodeTemuan turun (kode memuat nomor urut)
int _urut(Map<String, dynamic> a, Map<String, dynamic> b) {
  final c = teksWo(b['tanggal']).compareTo(teksWo(a['tanggal']));
  return c != 0 ? c : teksWo(b['kodeTemuan']).compareTo(teksWo(a['kodeTemuan']));
}

/// lokal + selisih server -> data baru (argumen tidak diubah). ringkas / tim / kursor / status dari selisih.
Map<String, dynamic> gabungSelisihWo(Map<String, dynamic>? lokal, Map<String, dynamic> selisih) {
  final peta = <String, Map<String, dynamic>>{};
  for (final t in daftarWo(lokal?['temuan'])) {
    peta[teksWo(t['temuanId'])] = t;
  }
  for (final t in daftarWo(selisih['temuan'])) {
    peta[teksWo(t['temuanId'])] = t;
  }
  return {...?lokal, ...selisih, 'selisih': false, 'temuan': peta.values.toList()..sort(_urut)};
}

/// BARU = belum diteruskan; TERKIRIM / DIKERJAKAN / SELESAI = sama; AKTIF = bukan SELESAI; lainnya (SEMUA, kosong) = semua.
List<Map<String, dynamic>> saringStatusWo(List<Map<String, dynamic>> temuan, String status) {
  String s(Map<String, dynamic> t) => teksWo(petaWo(t['wo'])['status']);
  switch (status) {
    case 'BARU':
      return temuan.where((t) => s(t).isEmpty).toList();
    case 'AKTIF':
      return temuan.where((t) => s(t) != StatusWo.selesai).toList();
    case 'TERKIRIM':
    case 'DIKERJAKAN':
    case 'SELESAI':
      return temuan.where((t) => s(t) == status).toList();
    default:
      return List.of(temuan);
  }
}
