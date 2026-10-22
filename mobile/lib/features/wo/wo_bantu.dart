/// v1.0.11 (permintaan kvlar 21 Okt 2026): bantuan murni (tanpa Flutter) untuk WO tindak lanjut temuan:
/// label status, jenis ROW dari diameter, jenis lokasi Hartek, kelengkapan foto, ringkasan daftar.
library;

import '../../core/kode_error.dart';

/// status_wo di SiSi_Temuan: '' (belum diteruskan) -> TERKIRIM -> DIKERJAKAN -> SELESAI.
class StatusWo {
  StatusWo._();
  static const baru = '';
  static const terkirim = 'TERKIRIM';
  static const dikerjakan = 'DIKERJAKAN';
  static const selesai = 'SELESAI';

  static String label(String s) {
    switch (s.trim()) {
      case terkirim:
        return 'Terkirim';
      case dikerjakan:
        return 'Dikerjakan';
      case selesai:
        return 'Selesai';
      default:
        return 'Belum diteruskan';
    }
  }

  /// Admin masih boleh memindah / menarik WO.
  static bool bolehPindah(String s) => s.trim() == baru || s.trim() == terkirim;
}

/// Slot foto pekerjaan WO (urutan tampil).
const List<String> slotFotoWo = ['SEBELUM', 'PEKERJAAN', 'SESUDAH'];
const Map<String, String> labelFotoWo = {'SEBELUM': 'Sebelum', 'PEKERJAAN': 'Pekerjaan', 'SESUDAH': 'Sesudah'};

/// v1.0.17: placeholder kolom diameter ROW (form eksekusi ROW + WO ROW). Chip jenis baru muncul sesudah diisi.
const String placeholderDiameterRow = 'Silahkan masukkan ukuran Diameter Batang';

/// Nama pekerjaan Yandal "lain-lain" (YAN_PEKERJAAN_LAIN_ di server) = wajib isi keterangan.
const String pekerjaanLainYandal = 'Lain - Lain';

String teksWo(Object? v) => v?.toString().trim() ?? '';

Map<String, dynamic> petaWo(Object? v) => v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};

List<Map<String, dynamic>> daftarWo(Object? v) =>
    v is List ? [for (final x in v) if (x is Map) Map<String, dynamic>.from(x)] : <Map<String, dynamic>>[];

/// v1.0.17 (integritas audit): temuan yang sudah diteruskan ke tim (status WO apa pun) tidak bisa diubah petugas inspeksi.
bool temuanTerkunciWo(Map<String, dynamic> t) => statusWoDari(t).isNotEmpty;

/// Status WO satu temuan (node getWoTim / getWoAdmin).
String statusWoDari(Map<String, dynamic> t) => teksWo(petaWo(t['wo'])['status']);

/// Jenis ROW dari diameter (cm, bulat): min dan max INKLUSIF, kosong = tanpa batas (sama dengan klasifikasiJenis_ server).
/// null = tidak masuk kategori mana pun / lebih dari satu cocok.
Map<String, dynamic>? jenisRowDariDiameter(List<Map<String, dynamic>> jenis, num? diameter) {
  if (diameter == null || diameter < 0 || diameter != diameter.roundToDouble()) return null;
  num? n(Object? v) => v == null || teksWo(v).isEmpty ? null : num.tryParse(teksWo(v));
  final cocok = jenis.where((j) {
    final min = n(j['diameterMin']), max = n(j['diameterMax']);
    if (min == null && max == null) return false;
    return (min == null || diameter >= min) && (max == null || diameter <= max);
  }).toList();
  return cocok.length == 1 ? cocok.first : null;
}

/// Jenis lokasi PG Hartek untuk temuan: object Gardu yang punya gardu = Gardu, selain itu Jaringan (jenisPgWo_ server).
String jenisPgTemuan(Map<String, dynamic> t) =>
    teksWo(t['objekInspeksi']).toLowerCase() == 'gardu' && (teksWo(t['garduId']).isNotEmpty || teksWo(t['noGardu']).isNotEmpty)
        ? 'Gardu'
        : 'Jaringan';

/// Pekerjaan Hartek yang boleh untuk jenis lokasi itu (jenisPekerjaan kosong = semua lokasi).
List<Map<String, dynamic>> jenisHartekUntuk(List<Map<String, dynamic>> jenis, String jenisPg) => [
      for (final j in jenis)
        if (teksWo(j['jenisPekerjaan']).isEmpty || teksWo(j['jenisPekerjaan']).toLowerCase() == jenisPg.toLowerCase()) j,
    ];

/// Lokasi ringkas temuan: penyulang · section · tiang / gardu.
String lokasiTemuanWo(Map<String, dynamic> t) => [
      teksWo(t['penyulang']),
      teksWo(t['section']),
      if (teksWo(t['noGardu']).isNotEmpty) 'Gardu ${teksWo(t['noGardu'])}',
      if (teksWo(t['nomorTiang']).isNotEmpty) 'Tiang ${teksWo(t['nomorTiang'])}',
    ].where((x) => x.isNotEmpty).join(' · ');

/// Slot wajib yang belum punya foto untuk satu pekerjaan DRAFT. v1.0.16: foto di HP (menunggu kirim, kunci
/// HartekLokal.fotoLokal) dihitung ada, karena antrean mengirimnya sebelum Selesai.
/// v1.0.17: foto HP yang DITOLAK server (GAGAL) dihitung belum ada (dulu ikut dihitung, Selesai bisa ditekan padahal
/// fotonya tidak akan pernah sampai server).
List<String> fotoKurangWo(Map<String, dynamic> pekerjaan, List<String> slotWajib) {
  final f = petaWo(pekerjaan['foto']), hp = petaWo(pekerjaan[kunciFotoHpWo]), st = petaWo(pekerjaan[kunciFotoSinkronWo]);
  return [
    for (final s in slotWajib)
      if (teksWo(f[s]).isEmpty && (teksWo(hp[s]).isEmpty || teksWo(st[s]) == 'GAGAL')) s,
  ];
}

/// v1.0.17: slot wajib yang fotonya baru ada di HP (antrean, belum diterima server).
List<String> fotoTertundaWo(Map<String, dynamic> pekerjaan, List<String> slotWajib) {
  final f = petaWo(pekerjaan['foto']), hp = petaWo(pekerjaan[kunciFotoHpWo]), st = petaWo(pekerjaan[kunciFotoSinkronWo]);
  return [
    for (final s in slotWajib)
      if (teksWo(f[s]).isEmpty && teksWo(hp[s]).isNotEmpty && teksWo(st[s]) != 'GAGAL') s,
  ];
}

/// Kunci foto di HP pada node pekerjaan (= HartekLokal.fotoLokal / HartekLokal.fotoSinkron).
const String kunciFotoHpWo = 'fotoLokal', kunciFotoSinkronWo = '_fotoSinkron';

/// v1.0.16: progres foto wajib WO (semua pekerjaan DRAFT): (ada, wajib).
/// v1.0.17 (sinkron atomik): [ada] = foto yang SUDAH diterima server saja; [tunda] = foto masih di antrean HP.
/// Kartu baru boleh hijau ("lengkap") kalau ada == wajib, jadi foto Sesudah yang belum terunggah tidak lagi membuat
/// WO terlihat lengkap sesudah foto Pekerjaan diperbarui.
({int ada, int wajib, int tunda}) progresFotoWo(Map<String, dynamic> t, List<String> slotWajib) {
  var ada = 0, wajib = 0, tunda = 0;
  for (final p in daftarWo(t['pekerjaanWo'])) {
    if (teksWo(p['status']) != 'DRAFT') continue;
    wajib += slotWajib.length;
    final kurang = fotoKurangWo(p, slotWajib).length, hp = fotoTertundaWo(p, slotWajib).length;
    tunda += hp;
    ada += slotWajib.length - kurang - hp;
  }
  return (ada: ada, wajib: wajib, tunda: tunda);
}

/// v1.0.17 (sinkron atomik): isian WO yang belum diterima server: pekerjaan (antrean / ditolak) + foto di HP.
({int pekerjaan, int foto, int ditolak}) sisaSinkronWo(Map<String, dynamic> t) {
  var pk = 0, foto = 0, tolak = 0;
  for (final p in daftarWo(t['pekerjaanWo'])) {
    final s = teksWo(p['_sinkron']);
    if (s == 'LOKAL') pk++;
    if (s == 'GAGAL') tolak++;
    for (final e in petaWo(p[kunciFotoHpWo]).entries) {
      if (teksWo(e.value).isEmpty) continue;
      if (teksWo(petaWo(p[kunciFotoSinkronWo])[e.key]) == 'GAGAL') {
        tolak++;
      } else {
        foto++;
      }
    }
  }
  return (pekerjaan: pk, foto: foto, ditolak: tolak);
}

/// v1.0.16: tujuan navigasi Google Maps dari koordinat 'lat, lng' (temuan / gardu). null = koordinat tidak valid.
Uri? uriNavigasiWo(String koordinat) {
  final m = RegExp(r'^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$').firstMatch(koordinat);
  if (m == null) return null;
  final lat = double.parse(m.group(1)!), lng = double.parse(m.group(2)!);
  if (lat.abs() > 90 || lng.abs() > 180) return null;
  return Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$lat,$lng&travelmode=driving');
}

/// v1.0.16: rincian WO Hartek dari isian form bertingkat: pekerjaan_1..N (jenisId) + jumlah_1..N,
/// v1.0.17 (permintaan kvlar 22 Okt 2026): material MENEMPEL ke pekerjaan yang memakainya, isian per pekerjaan ke-i:
/// material_i_1..M (materialId) + jumlahMaterial_i_1..M + kepemilikan_i_1..M (kepemilikan dari db_Kepemilikan_Material).
/// Baris kosong dilewati. [idBaru] membuat id baris (uuid) untuk pekerjaan ke-2 dst. dan material. Hasil
/// {pekerjaan: [{id?, jenisId, jumlah, material: [...]}]} siap di-jsonEncode untuk simpanPekerjaanWo.rincian.
Map<String, dynamic> rincianHartekWo(Map<String, String> n, String Function() idBaru, {int maksPekerjaan = 15, int maksMaterial = 10}) {
  String v(String k) => (n[k] ?? '').trim();
  num? a(String k) => num.tryParse(v(k).replaceAll(',', '.'));
  final pekerjaan = <Map<String, dynamic>>[];
  for (var i = 1; i <= maksPekerjaan; i++) {
    if (v('pekerjaan_$i').isEmpty) continue;
    final material = <Map<String, dynamic>>[
      for (var j = 1; j <= maksMaterial; j++)
        if (v(kunciMaterialWo('material', i, j)).isNotEmpty)
          {
            'id': idBaru(),
            'materialId': v(kunciMaterialWo('material', i, j)),
            'jumlah': a(kunciMaterialWo('jumlahMaterial', i, j)) ?? 0,
            'kepemilikan': v(kunciMaterialWo('kepemilikan', i, j)),
          },
    ];
    pekerjaan.add({if (pekerjaan.isNotEmpty) 'id': idBaru(), 'jenisId': v('pekerjaan_$i'), 'jumlah': a('jumlah_$i') ?? 0, 'material': material});
  }
  return {'pekerjaan': pekerjaan};
}

/// v1.0.17: kunci isian material ke-[j] milik pekerjaan ke-[i], mis. kunciMaterialWo('material', 2, 1) = 'material_2_1'.
String kunciMaterialWo(String awalan, int i, int j) => '${awalan}_${i}_$j';

/// v1.0.17: jumlah material seluruh pekerjaan dalam rincian (server membatasi 30 per isian WO).
int jumlahMaterialRincianWo(Map<String, dynamic> rincian) =>
    daftarWo(rincian['pekerjaan']).fold<int>(0, (a, p) => a + daftarWo(p['material']).length) + daftarWo(rincian['material']).length;

/// v1.0.17: material per pekerjaan dari rincian server / HP. Rincian lama (material di luar pekerjaan) = milik
/// pekerjaan pertama. Hasil sejajar dengan daftar pekerjaan.
List<List<Map<String, dynamic>>> materialPerPekerjaanWo(Map<String, dynamic> rincian) {
  final pk = daftarWo(rincian['pekerjaan']);
  final lepas = daftarWo(rincian['material']);
  final hasil = [for (final p in pk) daftarWo(p['material'])];
  if (hasil.isEmpty) return lepas.isEmpty ? const [] : [lepas];
  final dipakai = {for (final l in hasil) for (final m in l) teksWo(m['id'])};
  for (final m in lepas) {
    if (dipakai.contains(teksWo(m['id'])) && teksWo(m['id']).isNotEmpty) continue;
    final idx = pk.indexWhere((p) => teksWo(p['id']).isNotEmpty && teksWo(p['id']) == teksWo(m['pekerjaanId']));
    hasil[idx < 0 ? 0 : idx].add(m);
  }
  return hasil;
}

/// v1.0.16: jumlah baris isian bertingkat yang tampil: baris terisi + satu baris kosong berikutnya (maks [maks]).
int barisTampilWo(Map<String, String> n, String awalan, int maks) {
  var akhir = 0;
  for (var i = 1; i <= maks; i++) {
    if ((n['${awalan}_$i'] ?? '').trim().isNotEmpty) akhir = i;
  }
  return akhir >= maks ? maks : akhir + 1;
}

/// WO boleh diklik Selesai: dikerjakan, ada pekerjaan, semua foto wajib pekerjaan DRAFT lengkap.
/// Hasil = alasan belum bisa (null = siap).
String? alasanBelumSelesai(Map<String, dynamic> t, List<String> slotWajib) {
  if (statusWoDari(t) != StatusWo.dikerjakan) return 'Klik Mulai kerjakan dulu.';
  final p = daftarWo(t['pekerjaanWo']);
  if (p.isEmpty) return 'Catat minimal satu pekerjaan.';
  var kurang = 0;
  for (final x in p) {
    if (teksWo(x['status']) == 'DRAFT') kurang += fotoKurangWo(x, slotWajib).length;
  }
  // v1.0.17: data yang ditolak server harus diperbaiki dulu (Selesai tidak akan pernah sampai server)
  final tolak = sisaSinkronWo(t).ditolak;
  if (tolak > 0) return '$tolak data WO ditolak server. Kirim ulang atau perbaiki dulu.';
  if (kurang > 0) return '$kurang foto wajib belum diambil.';
  return null;
}

/// Jumlah WO per status untuk tab tim.
({int baru, int dikerjakan, int selesai}) ringkasWoTim(List<Map<String, dynamic>> wo) {
  var b = 0, d = 0, s = 0;
  for (final t in wo) {
    switch (statusWoDari(t)) {
      case StatusWo.terkirim:
        b++;
      case StatusWo.dikerjakan:
        d++;
      case StatusWo.selesai:
        s++;
    }
  }
  return (baru: b, dikerjakan: d, selesai: s);
}

/// '2026-10-21T03:15:00.000Z' -> '21/10 10:15' (WIB, tanpa intl).
String waktuWo(String iso) {
  final d = DateTime.tryParse(iso.trim());
  if (d == null) return iso;
  final w = d.toUtc().add(const Duration(hours: 7));
  String p(int n) => n.toString().padLeft(2, '0');
  return '${p(w.day)}/${p(w.month)} ${p(w.hour)}:${p(w.minute)}';
}

/// Cocok kata pencarian admin (kode, jenis, penyulang, gardu, tim).
bool cocokCariWo(Map<String, dynamic> t, String kata) {
  final k = kata.trim().toLowerCase();
  if (k.isEmpty) return true;
  final wo = petaWo(t['wo']);
  return [t['kodeTemuan'], t['jenisTemuan'], t['penyulang'], t['section'], t['noGardu'], t['nomorTiang'], t['tim'], wo['tim']]
      .any((v) => teksWo(v).toLowerCase().contains(k));
}

/// v1.0.15: tim inspeksi asal temuan (filter + label kartu Penerusan WO): Admin / nama tim / Petugas.
String timInspeksiWo(Map<String, dynamic> t) =>
    teksWo(t['sumber']) == 'ADMIN' ? 'Admin' : (teksWo(t['tim']).isEmpty ? 'Petugas' : teksWo(t['tim']));

/// v1.0.15: filter Penerusan WO. null = semua.
bool cocokFilterWo(Map<String, dynamic> t, {String? penyulang, String? timInspeksi}) =>
    (penyulang == null || teksWo(t['penyulang']) == penyulang) && (timInspeksi == null || timInspeksiWo(t) == timInspeksi);

/// v1.0.15: pilihan filter dari daftar temuan (unik, urut abjad, tanpa yang kosong).
List<String> pilihanFilterWo(List<Map<String, dynamic>> temuan, String Function(Map<String, dynamic>) ambil) =>
    ({for (final t in temuan) ambil(t)}..remove('')).toList()..sort();

/// v1.0.15: DateTime -> 'yyyy-MM-dd' (parameter dari / sampai getWoAdmin).
String tanggalIsoWo(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// v1.0.16: ringkasan satu pekerjaan WO (admin / verifikasi): nama + ukuran / jumlah, rincian Hartek digabung.
String ringkasPekerjaanWo(Map<String, dynamic> p) {
  final r = daftarWo(petaWo(p['rincian'])['pekerjaan']);
  String angka(Object? v) {
    final n = num.tryParse(teksWo(v));
    return n == null ? teksWo(v) : (n == n.roundToDouble() ? n.toInt().toString() : n.toString());
  }

  // v1.0.17: material ditulis di belakang pekerjaan yang memakainya, mis. "Ganti Arrester 1 Bh (Arrester 3 Bh PLN)"
  final mt = materialPerPekerjaanWo(petaWo(p['rincian']));
  String material(int i) {
    final l = i < mt.length ? mt[i] : const <Map<String, dynamic>>[];
    if (l.isEmpty) return '';
    return ' (${[for (final m in l) '${teksWo(m['nama'])} ${angka(m['jumlah'])} ${teksWo(m['satuan'])} ${teksWo(m['kepemilikan'])}'.replaceAll(RegExp(r'\s+'), ' ').trim()].join(', ')})';
  }

  if (r.length > 1) return [for (var i = 0; i < r.length; i++) '${'${teksWo(r[i]['nama'])} ${angka(r[i]['jumlah'])} ${teksWo(r[i]['satuan'])}'.trim()}${material(i)}'].join(', ');
  if (r.length == 1 && material(0).isNotEmpty) return '${'${teksWo(r[0]['nama'])} ${angka(r[0]['jumlah'])} ${teksWo(r[0]['satuan'])}'.trim()}${material(0)}';
  return [
    teksWo(p['pekerjaan']),
    if (teksWo(p['pekerjaanLainnya']).isNotEmpty) '(${teksWo(p['pekerjaanLainnya'])})',
    if (p['diameter'] != null && teksWo(p['diameter']).isNotEmpty) 'Ø ${p['diameter']} cm',
    if (teksWo(p['satuan']).isNotEmpty && p['diameter'] == null) '${angka(p['jumlah'])} ${teksWo(p['satuan'])}',
  ].where((x) => x.isNotEmpty).join(' ');
}

/// v1.0.16: status WO untuk kartu tim (termasuk keadaan HP): label, urutan tampil.
String statusTampilWo(Map<String, dynamic> t) {
  if (t['_konflik'] != null) return 'Dipindah admin';
  final s = teksWo(petaWo(t['_selesai'])['status']);
  if (s == 'VERIFIKASI') return 'Menunggu verifikasi';
  // v1.0.17 (sinkron atomik): "Selesai" hanya dari server; Selesai di HP = masih proses sinkron
  if (s == 'LOKAL' || s == 'GAGAL') return 'Proses sinkron';
  return StatusWo.label(statusWoDari(t));
}

/// v1.0.12: pesan galat layar WO. TIM_TIDAK_VALID dan FOTO_BELUM_LENGKAP sudah dipakai modul lain (Yandal, BA) dengan
/// arti berbeda di KodeError, jadi versi WO ditulis di sini.
String pesanWo(String kode) {
  switch (kode) {
    case 'TIM_TIDAK_VALID':
      return 'Tim tujuan tidak aktif atau bukan tim ROW / Hartek / Yandal.';
    case 'FOTO_BELUM_LENGKAP':
      return 'Foto pekerjaan belum lengkap. Lengkapi semua foto wajib.';
    case 'SECTION_TIDAK_COCOK':
      return 'Section bukan bagian penyulang temuan ini.';
    case 'SECTION_TERKUNCI': // v1.0.17
      return 'Section mengikuti input petugas inspeksi dan tidak bisa diubah.';
    // v1.0.16
    case 'WO_DIPINDAH':
      return 'WO ini sudah dipindahkan admin ke tim lain.';
    case 'WO_GANDA_MENUNGGU':
      return 'WO ini diunggah dua tim dan menunggu verifikasi di menu Verifikasi WO Ganda.';
    case 'WO_GANDA_SUDAH_DIPUTUSKAN':
      return 'WO ganda ini sudah diputuskan admin.';
    case 'WO_MENUNGGU_VERIFIKASI':
      return 'WO menunggu verifikasi admin, isian tidak bisa diubah lagi.';
    case 'FOTO_HARUS_KAMERA':
      return 'Foto WO Yandal wajib dari kamera SiSi (bukan galeri).';
    case 'MATERIAL_TIDAK_VALID':
      return 'Material tidak aktif di master. Pilih material lain.';
    case 'KEPEMILIKAN_TIDAK_VALID':
      return 'Kepemilikan material tidak ada di master. Pilih dari daftar.';
    default:
      return KodeError.pesan(kode);
  }
}
