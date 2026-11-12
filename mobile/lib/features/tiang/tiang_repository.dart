import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../core/sesi.dart';
import 'draf_tiang.dart';
import 'peta_tiang.dart';
import 'tiang_api.dart';
import 'tiang_model.dart';

/// Verifikasi Tiang + Segmen: pintu ke server tiang (Hostinger; jalur mundur ke Apps Script lewat [TiangApi]). Pilihan isian dan tiap jalur
/// terakhir disimpan di HP per akun (tetap terbaca tanpa sinyal). Simpan = satu paket data + foto lewat [DrafTiang] (draf di HP lebih dulu).
class TiangRepository implements TiangLokal {
  TiangRepository(this._api, {required this.draf});
  final TiangApi _api;

  /// Draf tiang / segmen yang belum diterima server.
  final DrafTiang draf;

  static const menu = 'OPS_VERIFIKASI_TIANG';
  static bool boleh(Sesi s) => (s.role == 'ADMIN' || s.role == 'SUPER') && s.aksiMenu(menu) != null;
  static bool bolehUbah(Sesi s) => boleh(s) && s.aksiMenu(menu) == 'UBAH';

  Future<Map<String, dynamic>> _panggil(Sesi s, String aksi, Map<String, dynamic> data, {int detik = 60}) =>
      _api.panggil(s, aksi, data, timeout: Duration(seconds: detik));

  Future<File> _berkas(Sesi s, String nama) async {
    final dir = Directory(p.join((await getApplicationDocumentsDirectory()).path, 'verifikasi_tiang'));
    if (!dir.existsSync()) await dir.create(recursive: true);
    return File(p.join(dir.path, '${s.userId.replaceAll(RegExp(r'[^0-9A-Za-z_-]'), '')}_$nama.json'));
  }

  Future<Map<String, dynamic>?> _baca(Sesi s, String nama) async {
    try {
      final f = await _berkas(s, nama);
      if (!f.existsSync()) return null;
      final j = jsonDecode(await f.readAsString());
      return j is Map ? Map<String, dynamic>.from(j) : null;
    } catch (_) {
      return null;
    }
  }

  Future<void> _tulis(Sesi s, String nama, Map<String, dynamic> j) async {
    try {
      final f = await _berkas(s, nama), tmp = File('${f.path}.tmp');
      await tmp.writeAsString(jsonEncode(j), flush: true);
      await tmp.rename(f.path);
    } catch (_) {
      // simpanan lokal hanya pelengkap
    }
  }

  Future<PilihanTiang?> pilihanLokal(Sesi s) async {
    final j = await _baca(s, 'pilihan');
    return j == null ? null : PilihanTiang.dariJson(j);
  }

  Future<PilihanTiang> pilihan(Sesi s) async {
    final j = await _panggil(s, 'getVerifikasiTiang', const {});
    await draf.daftar(s.userId);
    // segmen draf yang belum diterima server tetap bisa dipilih di form tiang
    final belum = [for (final x in draf.segmenBelumDiServer(s.userId)) if (x['aktif'] != false) _ringkasSegmen(x)];
    if (belum.isNotEmpty) {
      final ids = {for (final b in belum) '${b['segmenId']}'};
      j['segmen'] = [
        for (final x in (j['segmen'] as List? ?? const []).whereType<Map<dynamic, dynamic>>())
          if (!ids.contains('${x['segmenId']}')) x,
        ...belum,
      ];
    }
    await _tulis(s, 'pilihan', j);
    return PilihanTiang.dariJson(j);
  }

  /// Peta Master Jaringan: tiang Terverifikasi + garis penyulang (menu OPS_MASTER_SWITCHING). Terakhir tersimpan di HP.
  Future<PetaTiang?> petaLokal(Sesi s) async {
    final j = await _baca(s, 'peta');
    return j == null ? null : PetaTiang.dariJson(j);
  }

  Future<PetaTiang> peta(Sesi s) async {
    final j = await _panggil(s, 'getPetaTiang', const {}, detik: 90);
    await _tulis(s, 'peta', j);
    return PetaTiang.dariJson(j);
  }

  Future<List<Tiang>?> jalurLokal(Sesi s, String kode) async {
    final j = await _baca(s, 'jalur_$kode');
    return j == null ? null : [for (final x in (j['tiang'] as List? ?? const []).whereType<Map<dynamic, dynamic>>()) Tiang(Map<String, dynamic>.from(x))];
  }

  Future<List<Tiang>> jalur(Sesi s, String kode) async {
    final j = await _panggil(s, 'getTiangJalur', {'kode': kode}, detik: 90);
    await draf.daftar(s.userId);
    final belum = draf.belumDiServer(s.userId, kode);
    if (belum.isNotEmpty) {
      // draf yang belum diterima server tetap tampil (bertanda draf) di atas data unduhan
      final ids = {for (final b in belum) '${b['tiangId']}'};
      j['tiang'] = [
        for (final x in (j['tiang'] as List? ?? const []).whereType<Map<dynamic, dynamic>>())
          if (!ids.contains('${x['tiangId']}')) x,
        ...belum,
      ];
    }
    await _tulis(s, 'jalur_$kode', j);
    return [for (final x in (j['tiang'] as List? ?? const []).whereType<Map<dynamic, dynamic>>()) Tiang(Map<String, dynamic>.from(x))];
  }

  /// Ganti / tambah / hapus satu tiang di berkas jalur [kode] di HP.
  Future<void> _ubahJalur(Sesi s, String kode, String hapusId, Map<String, dynamic>? baru) async {
    final j = await _baca(s, 'jalur_$kode');
    if (j == null && baru == null) return;
    final daftar = [for (final x in (j?['tiang'] as List? ?? const []).whereType<Map<dynamic, dynamic>>()) Map<String, dynamic>.from(x)];
    final id = baru == null ? hapusId : '${baru['tiangId']}';
    final k = daftar.indexWhere((x) => '${x['tiangId']}' == hapusId || '${x['tiangId']}' == id);
    if (baru == null) {
      if (k >= 0) daftar.removeAt(k);
    } else if (k >= 0) {
      daftar[k] = baru;
    } else {
      daftar.add(baru);
    }
    await _tulis(s, 'jalur_$kode', {'kode': kode, 'tiang': daftar});
  }

  /// Simpan verifikasi: draf lengkap (data + foto) ditulis ke HP, lalu SATU paket dikirim ke server. Hasil [HasilKirim]:
  /// [Terkirim] (daftar jalur sudah diperbarui dari jawaban server), [Ditolak] (draf tetap, semua masalah isian), [BelumTerkirim] (draf menunggu sinyal).
  Future<HasilKirim> simpanTiang(Sesi s, IsianTiang i, Map<String, String> foto, {required String kode}) async {
    final asal = i.tiang?.json;
    final ref = i.tiang?.id ?? DrafTiang.idSementara();
    final k = uraiKoordinat(i.koordinat);
    final pakaiAset = i.dasarKoordinat == 'TERDAFTAR' && i.tiang?.latAset != null && i.tiang?.lngAset != null;
    final tampil = <String, dynamic>{
      ...?asal,
      'tiangId': ref,
      'nama': i.tiang?.nama ?? i.nama.trim(),
      'kode': i.tiang?.teks('kode').isNotEmpty == true ? i.tiang!.teks('kode') : kode,
      'revision': i.tiang?.revision ?? 0,
      'statusVerifikasi': i.status,
      if (!i.hilang) ...{
        if (pakaiAset) ...{'lat': i.tiang!.latAset, 'lng': i.tiang!.lngAset} else if (k != null) ...{'lat': k.$1, 'lng': k.$2},
        // sumber dicatat agar membuka lagi draf menampilkan koordinat yang tadi diisi
        'sumberKoordinat': pakaiAset ? 'aset' : (i.sumberKoordinat == 'PETA' ? 'peta' : 'lapangan'),
        'jenisTiang': i.jenis,
        'ukuranTiang': i.ukuran,
        'sisiJalan': i.sisiJalan,
        'jumlahSirkuit': i.sirkuit.length,
        'sirkuit': [for (final x in i.sirkuit) {...x.payload(), 'statusVerifikasi': i.status}],
      },
      'kurang': <String>[],
      'foto': {
        ...(asal?['foto'] is Map ? asal!['foto'] as Map : const {}),
        for (final slot in foto.keys) slot: true,
      },
    };
    // draf sebelumnya untuk tiang ini (mis. "perlu diperbaiki") menjaga tampilan awal; yang pertama menentukan
    final lama = draf.item(s.userId, ref);
    await draf.simpan(s, jenis: 'TIANG', ref: ref, kode: '${tampil['kode']}', data: i.payload(), tampil: tampil, asal: lama == null ? asal : (lama['asal'] as Map?)?.cast<String, dynamic>(), foto: foto);
    return draf.kirim(s, ref);
  }

  @override
  Future<void> terima(Sesi s, String refLama, Map<String, dynamic> tiang) => _ubahJalur(s, '${tiang['kode']}', refLama, tiang);

  @override
  Future<void> pulihkan(Sesi s, String ref, Map<String, dynamic>? asal, String kode) => _ubahJalur(s, kode, ref, asal);

  /// Thumbnail foto tiang dari server; terakhir berhasil diunduh disimpan di HP supaya tetap tampil tanpa sinyal.
  Future<List<int>> foto(Sesi s, String tiangId, String slot) async {
    final nama = 'foto_${tiangId.replaceAll(RegExp(r'[^0-9A-Za-z_-]'), '')}_$slot.jpg';
    try {
      final j = await _panggil(s, 'getFotoTiang', {'tiangId': tiangId, 'slot': slot, 'ukuran': 'KECIL'}, detik: 90);
      final b = base64Decode('${j['data'] ?? ''}');
      try {
        await (await _berkasFoto(s, nama)).writeAsBytes(b, flush: true);
      } catch (_) {
        // salinan di HP hanya pelengkap
      }
      return b;
    } catch (_) {
      try {
        final f = await _berkasFoto(s, nama);
        if (f.existsSync()) return await f.readAsBytes();
      } catch (_) {}
      rethrow;
    }
  }

  Future<File> _berkasFoto(Sesi s, String nama) async => File('${(await _berkas(s, 'x')).parent.path}${Platform.pathSeparator}${s.userId.replaceAll(RegExp(r'[^0-9A-Za-z_-]'), '')}_$nama');

  static Map<String, dynamic> _ringkasSegmen(Map<String, dynamic> x) =>
      {for (final k in const ['segmenId', 'nama', 'penyulang', 'sectionId']) k: x[k]};

  /// getSegmen: {segmen, jaringan, switching}; draf yang belum diterima server tetap tampil. Disimpan di HP.
  Future<Map<String, dynamic>> segmen(Sesi s) async {
    final j = await _panggil(s, 'getSegmen', const {});
    await draf.daftar(s.userId);
    final belum = draf.segmenBelumDiServer(s.userId);
    if (belum.isNotEmpty) {
      final ids = {for (final b in belum) '${b['segmenId']}'};
      j['segmen'] = [
        for (final x in (j['segmen'] as List? ?? const []).whereType<Map<dynamic, dynamic>>())
          if (!ids.contains('${x['segmenId']}')) x,
        ...belum,
      ];
    }
    await _tulis(s, 'segmen', j);
    return j;
  }

  /// Salinan getSegmen terakhir di HP (null = belum pernah diunduh).
  Future<Map<String, dynamic>?> segmenLokal(Sesi s) => _baca(s, 'segmen');

  /// Ganti / tambah / hapus satu segmen di salinan HP: daftar master segmen dan pilihan segmen form tiang.
  Future<void> _ubahSegmen(Sesi s, String hapusId, Map<String, dynamic>? baru) async {
    for (final (nama, ringkas) in const [('segmen', false), ('pilihan', true)]) {
      final j = await _baca(s, nama);
      if (j == null) continue;
      final daftar = [for (final x in (j['segmen'] as List? ?? const []).whereType<Map<dynamic, dynamic>>()) Map<String, dynamic>.from(x)];
      final id = baru == null ? hapusId : '${baru['segmenId']}';
      final k = daftar.indexWhere((x) => '${x['segmenId']}' == hapusId || '${x['segmenId']}' == id);
      final isi = baru == null ? null : (ringkas ? (baru['aktif'] == false ? null : _ringkasSegmen(baru)) : baru);
      if (isi == null) {
        if (k >= 0) daftar.removeAt(k);
      } else if (k >= 0) {
        daftar[k] = isi;
      } else {
        daftar.add(isi);
      }
      await _tulis(s, nama, {...j, 'segmen': daftar});
    }
  }

  /// Simpan segmen: draf ke HP lalu dikirim langsung (lihat [simpanTiang]).
  Future<HasilKirim> simpanSegmen(Sesi s, IsianSegmen i) async {
    final asal = i.asal?.d;
    final ref = i.asal?.id ?? DrafTiang.idSementara();
    final p = i.payload();
    final lengkap = i.kabelTanah && p['jenisKabel'] != null && p['ukuranMm2'] != null && p['panjangKabelM'] != null;
    final tampil = <String, dynamic>{
      ...?asal,
      // isian yang dikosongkan di form harus kosong juga di tampilan (payload tidak memuat isian kosong)
      for (final k in const ['jenisKabel', 'ukuranMm2', 'panjangKabelM', 'penghantarId', 'indukSegmenId', 'awalSwitchingId', 'akhirSwitchingId', 'segmenItb', 'catatan'])
        k: p[k] ?? '',
      ...p,
      'segmenId': ref,
      'revision': i.asal?.revision ?? 0,
      'aktif': i.aktif,
      'jenisSegmen': i.t['jenisSegmen'],
      'statusData': i.kabelTanah ? (lengkap ? 'LENGKAP' : 'KURANG') : '',
    };
    final lama = draf.item(s.userId, ref);
    await draf.simpan(s, jenis: 'SEGMEN', ref: ref, kode: '', data: p, tampil: tampil, asal: lama == null ? asal : (lama['asal'] as Map?)?.cast<String, dynamic>());
    return draf.kirim(s, ref);
  }

  @override
  Future<void> terimaSegmen(Sesi s, String refLama, Map<String, dynamic> segmen) => _ubahSegmen(s, refLama, segmen);

  @override
  Future<void> pulihkanSegmen(Sesi s, String ref, Map<String, dynamic>? asal) => _ubahSegmen(s, ref, asal);
}
