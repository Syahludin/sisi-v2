import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:gal/gal.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';

import '../../core/api_client.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../data/local_db.dart';
import 'row_model.dart';
import 'row_outbox.dart';
import 'row_repository.dart';
import 'watermark.dart';

/// Satu foto di HP (tabel foto_antre). status: TERTUNDA | TERKIRIM | GAGAL.
class FotoLokal {
  FotoLokal(this.m);
  final Map<String, Object?> m;
  String get fotoId => m['foto_id'] as String;
  String get eksekusiId => m['eksekusi_id'] as String;
  String get slot => m['jenis_foto'] as String;
  String get path => m['path'] as String;
  String get status => m['status'] as String;
  String? get alasan => m['alasan'] as String?;
}

/// Foto baru yang belum disimpan (hasil kamera SiSi / galeri). Kamera membawa waktu jepret + posisi GPS saat jepret.
class FotoBaru {
  const FotoBaru(this.file, this.sumber, {this.diambil, this.lat, this.lng, this.akurasiM, this.gpsSusulanDetik, this.sejakJepret});
  final XFile file;
  final String sumber; // KAMERA | GALERI
  final DateTime? diambil;
  final double? lat;
  final double? lng;
  final double? akurasiM;

  /// v0.65.2 (P0): titik GPS didapat N detik SESUDAH jepret (maks GpsSusulan.jendela). null = fix saat jepret / tanpa GPS.
  final int? gpsSusulanDetik;

  /// v0.65.3 (P0): jam monoton sejak jepret. Foto direview dulu, jadi waktu foto = jam terpercaya saat disimpan dikurangi umur ini.
  final Stopwatch? sejakJepret;
}

/// v0.62.8: foto yang sudah dirender + ditulis ke folder app, BELUM tercatat di foto_antre. Dicatat lewat
/// [FotoRepository.catat] di dalam transaksi pemanggil (simpan eksekusi baru: semua-atau-tidak).
class FotoSiap {
  const FotoSiap({
    required this.fotoId,
    required this.slot,
    required this.path,
    required this.pathAsli,
    required this.sha256,
    required this.ukuran,
    required this.sumber,
    required this.diambil,
    required this.tanda,
    this.lat,
    this.lng,
    this.akurasiM,
  });
  final String fotoId;
  final String slot;
  final String path;
  final String? pathAsli;
  final String sha256;
  final int ukuran;
  final String sumber;
  final DateTime diambil;
  final String? tanda;
  final double? lat;
  final double? lng;
  final double? akurasiM;
}

/// Foto eksekusi ROW (PRD F-ROW-FOTO): 3 slot, JPEG maks 2 MB, sisi terpanjang 1600 px (kualitas 80) dari HP.
/// Foto disimpan di folder app lalu dikirim satu per satu lewat uploadFotoRow setelah eksekusinya diterima server.
///
/// Watermark (v0.28-v0.29): SEMUA foto diberi watermark saat disimpan (kotak data kiri bawah, logo PLN kanan atas).
/// Kamera SiSi wajib landscape, koordinat = GPS saat jepret (±akurasi). Galeri ditandai "Sumber: Galeri", koordinat dari
/// input form. File asli tanpa watermark disimpan di HP (path_asli). Sebelum upload, isi watermark dicek lagi terhadap
/// data eksekusi terbaru (kode final setelah sync, data hasil Edit): beda = dirender ulang.
class FotoRepository {
  FotoRepository(this._api, this._db);

  final ApiClient _api;
  final LocalDb _db;

  static const List<String> slot = ['SEBELUM', 'PEKERJAAN', 'SESUDAH'];
  static const Map<String, String> label = {'SEBELUM': 'Sebelum', 'PEKERJAAN': 'Pekerjaan', 'SESUDAH': 'Sesudah'};
  static const int maksByte = 2 * 1024 * 1024;
  static const String pesanLandscape = 'Foto kamera harus landscape. Putar HP mendatar lalu ambil ulang.';

  static String timSesi(Sesi s) => s.jenisTim.isEmpty ? 'ROW' : s.jenisTim;

  /// Album galeri HP untuk foto ber-watermark yang diunduh / disimpan petugas (v0.31).
  static const String albumGaleri = 'SiSi ROW';

  /// Izin simpan ke galeri (diminta sekali). false = ditolak.
  static Future<bool> izinGaleri() async {
    try {
      if (await Gal.hasAccess(toAlbum: true)) return true;
      return await Gal.requestAccess(toAlbum: true);
    } catch (_) {
      return false;
    }
  }

  /// Salin foto ber-watermark ke galeri HP (album SiSi ROW). Nama file = kode eksekusi + slot supaya mudah dicari.
  /// File di folder app tidak diubah.
  /// v0.64.7: `album` lain untuk foto P0 Yandal.
  static Future<void> keGaleri(String path, {required String nama, String album = albumGaleri}) async {
    final tmp = await getTemporaryDirectory();
    final aman = nama.replaceAll(RegExp(r'[^A-Za-z0-9._-]+'), '_');
    final salin = File(p.join(tmp.path, '$aman.jpg'));
    await File(path).copy(salin.path);
    try {
      await Gal.putImage(salin.path, album: album);
    } on GalException catch (e) {
      throw RowError('Gagal simpan ke galeri (${e.type.message}).');
    } finally {
      if (await salin.exists()) await salin.delete();
    }
  }

  /// Data watermark dari eksekusi + realisasi di HP + sesi. null = eksekusi tidak ada di HP.
  /// lat/lng/akurasi ada (kamera dengan GPS) = koordinat foto; tidak ada = koordinat pekerjaan (input).
  Future<DataWatermark?> dataWatermark(Sesi s, String eksekusiId, String slotFoto, DateTime waktu,
      {String sumber = 'KAMERA', double? lat, double? lng, double? akurasiM}) async {
    final r = await _db.db.rawQuery('''
      SELECT e.kode, e.section, e.koordinat_pekerjaan, e.diameter, e.jenis_nama, r.penyulang
      FROM row_eksekusi e LEFT JOIN row_realisasi r ON r.id = e.realisasi_id WHERE e.id = ? LIMIT 1''', [eksekusiId]);
    if (r.isEmpty) return null;
    final e = r.first;
    return dataWatermarkDari(s,
        kodeEksekusi: e['kode'] as String,
        penyulang: e['penyulang'] as String?,
        section: e['section'] as String?,
        koordinatPekerjaan: e['koordinat_pekerjaan'] as String?,
        diameter: e['diameter'] as int?,
        jenis: e['jenis_nama'] as String?,
        slotFoto: slotFoto,
        waktu: waktu,
        sumber: sumber,
        lat: lat,
        lng: lng,
        akurasiM: akurasiM);
  }

  /// v0.62.8: data watermark dari isi form (eksekusi baru yang belum ada di HP). Sama persis dengan [dataWatermark].
  DataWatermark dataWatermarkDari(Sesi s,
      {required String kodeEksekusi,
      String? penyulang,
      String? section,
      String? koordinatPekerjaan,
      int? diameter,
      String? jenis,
      required String slotFoto,
      required DateTime waktu,
      String sumber = 'KAMERA',
      double? lat,
      double? lng,
      double? akurasiM}) {
    return DataWatermark(
      kodeEksekusi: kodeEksekusi,
      ulp: s.ulp,
      tim: timSesi(s),
      subTim: s.timNama,
      penyulang: penyulang,
      section: section,
      waktu: waktu,
      koordinat: lat != null && lng != null ? Koordinat.format(lat, lng) : koordinatPekerjaan,
      akurasiM: lat != null && lng != null ? (akurasiM ?? 0) : null,
      diameter: diameter,
      jenis: jenis,
      slot: label[slotFoto] ?? slotFoto,
      sumber: sumber,
    );
  }

  /// Data watermark untuk satu baris foto_antre (render ulang).
  Future<DataWatermark?> _dataBaris(Sesi s, Map<String, Object?> x) => dataWatermark(
        s,
        x['eksekusi_id'] as String,
        x['jenis_foto'] as String,
        _waktu(x['diambil_pada']),
        sumber: (x['sumber'] as String?) ?? 'KAMERA',
        lat: (x['lat'] as num?)?.toDouble(),
        lng: (x['lng'] as num?)?.toDouble(),
        akurasiM: (x['akurasi_m'] as num?)?.toDouble(),
      );

  static DateTime _waktu(Object? iso) => DateTime.tryParse((iso as String?) ?? '') ?? DateTime.now();

  Future<void> _hapusFile(String? path) async {
    if (path == null) return;
    final f = File(path);
    if (await f.exists()) await f.delete();
  }

  /// Ambil foto dari kamera / galeri, sudah diperkecil HP (1600 px, kualitas 80).
  static Future<XFile?> ambil(ImageSource sumber) =>
      ImagePicker().pickImage(source: sumber, maxWidth: 1600, maxHeight: 1600, imageQuality: 80);

  /// Foto terbaru per slot untuk satu eksekusi.
  Future<Map<String, FotoLokal>> untukEksekusi(String eksekusiId) async {
    final r = await _db.db.query('foto_antre',
        where: 'eksekusi_id = ?', whereArgs: [eksekusiId], orderBy: 'dibuat_pada DESC');
    final hasil = <String, FotoLokal>{};
    for (final x in r) {
      final f = FotoLokal(x);
      hasil.putIfAbsent(f.slot, () => f);
    }
    return hasil;
  }

  /// Jumlah slot terisi per eksekusi (untuk kartu daftar).
  Future<Map<String, int>> jumlahSlot(List<String> eksekusiId) async {
    if (eksekusiId.isEmpty) return const {};
    final tanda = List.filled(eksekusiId.length, '?').join(',');
    final r = await _db.db.rawQuery(
        'SELECT eksekusi_id AS id, COUNT(DISTINCT jenis_foto) AS n FROM foto_antre WHERE eksekusi_id IN ($tanda) GROUP BY eksekusi_id',
        eksekusiId);
    return {for (final x in r) x['id'] as String: (x['n'] as int?) ?? 0};
  }

  /// v0.62.5: foto GAGAL milik eksekusi yang masih AKTIF (perlu Kirim ulang / ambil ulang di detail eksekusi).
  Future<int> jumlahGagal(String userId) async {
    final r = await _db.db.rawQuery('''
      SELECT COUNT(*) AS n FROM foto_antre f JOIN row_eksekusi e ON e.id = f.eksekusi_id
      WHERE f.user_id = ? AND f.status = 'GAGAL' AND e.status = 'AKTIF'
      ''', [userId]);
    return (r.first['n'] as int?) ?? 0;
  }

  Future<int> jumlahTertunda(String userId) async {
    final r = await _db.db.rawQuery("SELECT COUNT(*) AS n FROM foto_antre WHERE user_id = ? AND status = 'TERTUNDA'", [userId]);
    return (r.first['n'] as int?) ?? 0;
  }

  /// Simpan foto ke folder app + antre upload. Foto lama di slot sama yang BELUM terkirim dibuang
  /// (yang sudah terkirim dibiarkan; server menandai BATAL saat foto pengganti diterima).
  /// Dipakai untuk eksekusi yang SUDAH ada (detail eksekusi). Eksekusi baru: [siapkan] + [catat] (v0.62.8).
  Future<void> simpan(Sesi s, {required String eksekusiId, required String slotFoto, required FotoBaru foto}) async {
    if (!slot.contains(slotFoto)) throw ArgumentError.value(slotFoto, 'slot');
    final diambil = foto.diambil ?? DateTime.now();
    final d = await dataWatermark(s, eksekusiId, slotFoto, diambil,
        sumber: foto.sumber, lat: foto.lat, lng: foto.lng, akurasiM: foto.akurasiM);
    if (d == null) throw RowError('Eksekusi tidak ditemukan di HP.');
    final siap = await siapkan(slotFoto: slotFoto, foto: foto, d: d);
    final List<String> lama;
    try {
      lama = await _db.db.transaction((tx) => catat(tx, s, eksekusiId, siap));
    } catch (_) {
      await buangSiap(siap);
      rethrow;
    }
    lupakanSiap([siap]);
    for (final x in lama) {
      await _hapusFile(x);
    }
  }

  /// v0.62.8: cek + render + tulis file foto (watermark dari [d]), TANPA menyentuh database.
  /// Gagal = RowError dan tidak ada file yang tertinggal.
  Future<FotoSiap> siapkan({required String slotFoto, required FotoBaru foto, required DataWatermark d}) async {
    if (!slot.contains(slotFoto)) throw ArgumentError.value(slotFoto, 'slot');
    final sumber = foto.sumber;
    final bytes = await foto.file.readAsBytes();
    if (bytes.length < 4 || bytes[0] != 0xFF || bytes[1] != 0xD8) {
      throw RowError('Foto harus JPEG. Ambil ulang pakai kamera.');
    }
    if (bytes.length > 20 * 1024 * 1024) throw RowError('Foto terlalu besar. Ambil ulang.');
    final kamera = sumber == 'KAMERA';
    if (kamera && !await Watermark.landscape(bytes)) throw RowError(pesanLandscape);
    final diambil = foto.diambil ?? d.waktu;
    final dir = Directory(p.join((await getApplicationDocumentsDirectory()).path, 'foto'));
    await dir.create(recursive: true);
    final fotoId = RowOutbox.uuidBaru();
    final path = p.join(dir.path, '$fotoId.jpg');
    final pathAsli = p.join(dir.path, '${fotoId}_asli.jpg');
    _disiapkan.addAll([p.basename(path), p.basename(pathAsli)]);
    final Uint8List akhir;
    if (!kamera) {
      // v0.44 (revisi kvlar 4 Okt 2026): foto GALERI tanpa watermark, hanya diperkecil (1600 px) supaya muat
      // batas server. Tanpa file asli & tanda watermark: tidak pernah dirender ulang / dibuatkan pengganti.
      try {
        akhir = await Watermark.perkecil(bytes);
      } catch (_) {
        throw RowError('Foto galeri tidak bisa dibaca. Pilih foto lain.');
      }
      if (akhir.length > maksByte) throw RowError('Foto galeri lebih dari 2 MB setelah diperkecil. Pilih foto lain.');
    } else {
      try {
        final dasar = await Watermark.perkecil(bytes); // sisi terpanjang 1600, tanpa watermark
        await File(pathAsli).writeAsBytes(dasar, flush: true);
        akhir = await Watermark.pasang(dasar, d);
      } catch (_) {
        await _hapusFile(pathAsli);
        throw RowError('Watermark gagal dibuat. Ambil ulang foto.');
      }
      if (akhir.length > maksByte) {
        await _hapusFile(pathAsli);
        throw RowError('Foto + watermark lebih dari 2 MB. Ambil ulang.');
      }
    }
    final String? tanda = kamera ? d.tanda : null;
    try {
      await File(path).writeAsBytes(akhir, flush: true);
    } catch (_) {
      await _hapusFile(path);
      await _hapusFile(kamera ? pathAsli : null);
      throw RowError('Foto gagal disimpan di HP. Coba lagi.');
    }
    return FotoSiap(
      fotoId: fotoId,
      slot: slotFoto,
      path: path,
      pathAsli: kamera ? pathAsli : null,
      sha256: sha256.convert(akhir).toString(),
      ukuran: akhir.length,
      sumber: sumber,
      diambil: diambil,
      tanda: tanda,
      lat: foto.lat,
      lng: foto.lng,
      akurasiM: foto.akurasiM,
    );
  }

  /// v0.62.8: catat [f] di foto_antre DI DALAM transaksi [tx] milik pemanggil. Foto lama di slot sama yang belum
  /// terkirim dibuang dari DB; hasil = path file lama yang harus dihapus pemanggil SETELAH transaksi berhasil.
  Future<List<String>> catat(DatabaseExecutor tx, Sesi s, String eksekusiId, FotoSiap f) async {
    final lama = await tx.query('foto_antre',
        where: 'eksekusi_id = ? AND jenis_foto = ? AND status != ?', whereArgs: [eksekusiId, f.slot, 'TERKIRIM']);
    await tx.delete('foto_antre',
        where: 'eksekusi_id = ? AND jenis_foto = ? AND status != ?', whereArgs: [eksekusiId, f.slot, 'TERKIRIM']);
    await tx.insert('foto_antre', {
      'foto_id': f.fotoId,
      'user_id': s.userId,
      'eksekusi_id': eksekusiId,
      'jenis_foto': f.slot,
      'path': f.path,
      'status': 'TERTUNDA',
      'dibuat_pada': DateTime.now().toUtc().toIso8601String(),
      'sumber': f.sumber,
      'sha256': f.sha256,
      'ukuran': f.ukuran,
      'diambil_pada': f.diambil.toUtc().toIso8601String(),
      'path_asli': f.pathAsli,
      'wm_tanda': f.tanda,
      'lat': f.lat,
      'lng': f.lng,
      'akurasi_m': f.akurasiM,
    });
    return [
      for (final x in lama)
        for (final k in const ['path', 'path_asli'])
          if (x[k] is String && (x[k] as String).isNotEmpty) x[k] as String,
    ];
  }

  /// v0.62.8: nama file yang sedang disiapkan di proses app ini (belum tentu sudah tercatat); dilindungi dari
  /// [bersihkanYatim]. Hilang saat app ditutup, dan saat itu simpan yang belum selesai memang batal.
  static final Set<String> _disiapkan = <String>{};

  /// v0.62.8: sudah tercatat di foto_antre (transaksi commit) = tidak perlu dilindungi lagi.
  void lupakanSiap(Iterable<FotoSiap> daftar) {
    for (final f in daftar) {
      _disiapkan.removeAll([p.basename(f.path), if (f.pathAsli != null) p.basename(f.pathAsli!)]);
    }
  }

  /// v0.62.8: hapus file foto yang sudah disiapkan tapi tidak jadi dicatat.
  Future<void> buangSiap(FotoSiap f) async {
    _disiapkan.removeAll([p.basename(f.path), if (f.pathAsli != null) p.basename(f.pathAsli!)]);
    try {
      await _hapusFile(f.path);
      await _hapusFile(f.pathAsli);
    } catch (_) {
      // dibiarkan; dibersihkan bersihkanYatim
    }
  }

  /// v0.62.8: file di folder foto yang tidak dipakai baris foto_antre mana pun (semua akun di HP ini), lebih tua
  /// dari 1 jam: sisa simpan yang terputus (app mati sebelum transaksi). Prinsip: belum tersimpan = belum fix.
  Future<int> bersihkanYatim() async {
    try {
      return await _bersihkanYatim();
    } catch (_) {
      return 0; // tidak boleh mengganggu app; dicoba lagi saat sesi berikutnya
    }
  }

  Future<int> _bersihkanYatim() async {
    final dir = Directory(p.join((await getApplicationDocumentsDirectory()).path, 'foto'));
    if (!await dir.exists()) return 0;
    final dipakai = <String>{};
    for (final x in await _db.db.query('foto_antre', columns: ['path', 'path_asli'])) {
      for (final k in const ['path', 'path_asli']) {
        final v = x[k];
        if (v is String && v.isNotEmpty) dipakai.add(p.basename(v));
      }
    }
    final pola = RegExp(r'^[0-9a-fA-F-]{36}(_asli)?\.jpg$');
    final batas = DateTime.now().subtract(const Duration(hours: 1));
    var n = 0;
    await for (final e in dir.list()) {
      if (e is! File) continue;
      final nama = p.basename(e.path);
      if (!pola.hasMatch(nama) || dipakai.contains(nama) || _disiapkan.contains(nama)) continue;
      try {
        if ((await e.lastModified()).isAfter(batas)) continue;
        await e.delete();
        n++;
      } catch (_) {
        // coba lagi lain kali
      }
    }
    return n;
  }

  /// Render ulang watermark file `path` dari file asli kalau isinya sudah tidak sesuai data eksekusi.
  /// Hasil: (sha256, ukuran) terbaru, atau null kalau tidak perlu / tidak bisa (asli tidak ada).
  Future<({String sha, int ukuran})?> _segarkanFile(Sesi s, Map<String, Object?> x) async {
    if (x['sumber'] == 'GALERI') return null; // v0.44: foto galeri tanpa watermark
    final asli = x['path_asli'] as String?;
    if (asli == null || !await File(asli).exists()) return null;
    final d = await _dataBaris(s, x);
    if (d == null || d.tanda == x['wm_tanda']) return null;
    final b = await Watermark.pasang(await File(asli).readAsBytes(), d);
    if (b.length > maksByte) throw RowError('Foto + watermark lebih dari 2 MB.');
    await File(x['path'] as String).writeAsBytes(b, flush: true);
    final sha = sha256.convert(b).toString();
    await _db.db.update('foto_antre', {'sha256': sha, 'ukuran': b.length, 'wm_tanda': d.tanda},
        where: 'foto_id = ?', whereArgs: [x['foto_id']]);
    return (sha: sha, ukuran: b.length);
  }

  /// Setelah Edit eksekusi: foto kamera yang SUDAH terkirim dengan watermark lama dibuatkan pengganti
  /// (foto_id baru, render ulang dari file asli) lalu diantre. Server menandai foto lama BATAL saat pengganti diterima.
  /// Foto yang belum terkirim cukup dirender ulang saat dikirim. Hasil: jumlah foto yang diantre ulang.
  /// v0.62.7 (audit 7 Okt 2026): hasil juga daftar slot yang watermark-nya TIDAK bisa diperbarui (file asli tidak ada,
  /// hasil > 2 MB, gagal render). Dulu dilewati diam-diam, jadi foto di server tetap bertuliskan data lama.
  Future<({int diganti, List<String> basi})> segarkanWatermark(Sesi s, String eksekusiId) async {
    final terbaru = await untukEksekusi(eksekusiId);
    final dir = Directory(p.join((await getApplicationDocumentsDirectory()).path, 'foto'));
    await dir.create(recursive: true);
    var n = 0;
    final basi = <String>[];
    for (final f in terbaru.values) {
      final x = f.m;
      final asli = x['path_asli'] as String?;
      if (x['sumber'] == 'GALERI') continue; // v0.44: foto galeri tanpa watermark
      if (f.status != 'TERKIRIM') continue; // TERTUNDA: watermark diperbarui saat dikirim (_segarkanFile)
      final d = await _dataBaris(s, x);
      if (d == null || d.tanda == x['wm_tanda']) continue;
      if (asli == null || !await File(asli).exists()) {
        basi.add(f.slot);
        continue;
      }
      final Uint8List b;
      try {
        b = await Watermark.pasang(await File(asli).readAsBytes(), d);
      } catch (_) {
        basi.add(f.slot);
        continue;
      }
      if (b.length > maksByte) {
        basi.add(f.slot);
        continue;
      }
      final fotoId = RowOutbox.uuidBaru();
      final path = p.join(dir.path, '$fotoId.jpg');
      await File(path).writeAsBytes(b, flush: true);
      await _db.db.transaction((tx) async {
        // file asli pindah ke baris pengganti (satu pemilik, supaya tidak ikut terhapus)
        await tx.update('foto_antre', {'path_asli': null}, where: 'foto_id = ?', whereArgs: [f.fotoId]);
        await tx.insert('foto_antre', {
          'foto_id': fotoId,
          'user_id': s.userId,
          'eksekusi_id': eksekusiId,
          'jenis_foto': f.slot,
          'path': path,
          'status': 'TERTUNDA',
          'dibuat_pada': DateTime.now().toUtc().toIso8601String(),
          'sumber': x['sumber'] ?? 'KAMERA',
          'sha256': sha256.convert(b).toString(),
          'ukuran': b.length,
          'diambil_pada': x['diambil_pada'],
          'path_asli': asli,
          'wm_tanda': d.tanda,
          'lat': x['lat'],
          'lng': x['lng'],
          'akurasi_m': x['akurasi_m'],
        });
      });
      n++;
    }
    return (diganti: n, basi: basi);
  }

  /// Kirim foto TERTUNDA yang eksekusinya sudah diterima server. Jaringan putus = berhenti (lempar), sisanya antre.
  Future<({int terkirim, int gagal})> kirim(Sesi s) async {
    final r = await _db.db.rawQuery('''
      SELECT f.* FROM foto_antre f JOIN row_eksekusi e ON e.id = f.eksekusi_id
      WHERE f.user_id = ? AND f.status = 'TERTUNDA' AND e.sinkron = 'TERKIRIM' AND e.status = 'AKTIF'
      ORDER BY f.dibuat_pada ASC''', [s.userId]);
    var ok = 0, gagal = 0;
    for (final x in r) {
      final f = FotoLokal(x);
      final file = File(f.path);
      if (!await file.exists()) {
        await _tandai(f.fotoId, 'GAGAL', 'FILE_HILANG');
        gagal++;
        continue;
      }
      String sha = x['sha256'] as String;
      try {
        final baru = await _segarkanFile(s, x); // kode / data eksekusi berubah sejak foto disimpan
        if (baru != null) sha = baru.sha;
      } on RowError catch (e) {
        await _tandai(f.fotoId, 'GAGAL', e.pesan);
        gagal++;
        continue;
      }
      final bytes = await file.readAsBytes();
      try {
        final d = await _api.call('uploadFotoRow', token: s.token, data: {
          'fotoId': f.fotoId,
          'eksekusiId': f.eksekusiId,
          'slot': f.slot,
          'sumberFoto': (x['sumber'] as String?) ?? 'KAMERA',
          'mime': 'image/jpeg',
          'sha256': sha,
          'ukuranByte': bytes.length,
          'data': base64Encode(bytes),
          if (x['diambil_pada'] != null) 'diambilPada': x['diambil_pada'],
          if (x['lat'] != null && x['lng'] != null) ...{
            'lat': x['lat'],
            'lng': x['lng'],
            if (x['akurasi_m'] != null) 'akurasiM': x['akurasi_m'],
          },
          'waktuPerangkat': DateTime.now().toUtc().toIso8601String(),
        });
        await _tandai(f.fotoId, 'TERKIRIM', null);
        await _db.db.update('row_eksekusi', {'foto_lengkap': d['fotoLengkap'] == true ? 1 : 0},
            where: 'id = ?', whereArgs: [f.eksekusiId]);
        ok++;
      } on ApiException catch (e) {
        if (KodeError.sesiHabis.contains(e.kode) || e.kode.startsWith('HTTP_') || e.kode == KodeError.serverSibuk) rethrow;
        // v0.62.4 (audit 6 Okt 2026): rem server (uploadFotoRow 30 / menit) bukan foto rusak. Dulu foto ini jadi GAGAL
        // (merah, tunggu ketuk ulang). Sekarang berhenti di sini: foto ini dan sisanya tetap TERTUNDA, dikirim sync berikutnya.
        if (e.kode == KodeError.terlaluSering) break;
        // v0.62.5: folder foto server terbuka untuk umum = masalah setelan server, bukan foto ini. Tetap TERTUNDA.
        if (e.kode == 'FOTO_TIDAK_PRIVAT') break;
        await _tandai(f.fotoId, 'GAGAL', e.kode);
        gagal++;
      }
    }
    return (terkirim: ok, gagal: gagal);
  }

  /// Download ulang semua foto AKTIF eksekusi ini dari server (getFotoRow), 1 foto per panggilan.
  /// File disimpan di folder app sebagai TERKIRIM (tidak dikirim ulang). Foto baru di HP yang belum terkirim
  /// tetap dipakai (lebih baru dari salinan server). `progres(selesai, total, slot)`.
  /// `simpanGaleri` = salinan ber-watermark juga masuk galeri HP (album SiSi ROW); gagal galeri tidak membatalkan unduhan.
  /// Hasil: jumlah foto yang diunduh (0 = belum ada foto di server) dan yang masuk galeri.
  Future<({int unduh, int galeri})> unduhUlang(Sesi s, String eksekusiId,
      {void Function(int selesai, int total, String? slot)? progres, bool simpanGaleri = false}) async {
    final daftar = await _api.call('getFotoRow', token: s.token, data: {'eksekusiId': eksekusiId});
    final foto = ((daftar['foto'] as List?) ?? const []).cast<Map<String, dynamic>>();
    progres?.call(0, foto.length, null);
    if (foto.isEmpty) return (unduh: 0, galeri: 0);
    final kodeEks = (daftar['kodeEksekusi'] as String?) ?? eksekusiId;
    var keGaleriOk = 0;
    final dir = Directory(p.join((await getApplicationDocumentsDirectory()).path, 'foto'));
    await dir.create(recursive: true);
    var n = 0;
    for (final meta in foto) {
      final slotFoto = meta['slot'] as String;
      progres?.call(n, foto.length, slotFoto);
      final d = await _api.call('getFotoRow', token: s.token, data: {'eksekusiId': eksekusiId, 'slot': slotFoto});
      final f = ((d['foto'] as List).first as Map).cast<String, dynamic>();
      final bytes = base64Decode(f['data'] as String);
      final hash = sha256.convert(bytes).toString();
      final hashServer = (f['sha256'] as String?) ?? '';
      if (hashServer.isNotEmpty && hashServer != hash) throw ApiException('FOTO_UNDUH_RUSAK');
      final fotoId = f['fotoId'] as String;
      final path = p.join(dir.path, '$fotoId.jpg');
      await File(path).writeAsBytes(bytes, flush: true);

      final lama = await _db.db.query('foto_antre',
          where: 'eksekusi_id = ? AND jenis_foto = ? AND status = ? AND foto_id != ?',
          whereArgs: [eksekusiId, slotFoto, 'TERKIRIM', fotoId]);
      final belumTerkirim = await _db.db.query('foto_antre',
          where: 'eksekusi_id = ? AND jenis_foto = ? AND status != ?', whereArgs: [eksekusiId, slotFoto, 'TERKIRIM'], limit: 1);
      final sama = await _db.db.query('foto_antre', where: 'foto_id = ?', whereArgs: [fotoId], limit: 1);
      final asliSama = sama.isEmpty ? null : sama.first['path_asli'] as String?;
      await _db.db.transaction((tx) async {
        for (final x in lama) {
          await tx.delete('foto_antre', where: 'foto_id = ?', whereArgs: [x['foto_id']]);
        }
        await tx.insert(
          'foto_antre',
          {
            'foto_id': fotoId,
            'user_id': s.userId,
            'eksekusi_id': eksekusiId,
            'jenis_foto': slotFoto,
            'path': path,
            'status': 'TERKIRIM',
            // ada foto baru yang belum terkirim = salinan server dianggap lebih lama supaya tidak menutupi
            'dibuat_pada': belumTerkirim.isEmpty ? DateTime.now().toUtc().toIso8601String() : '1970-01-01T00:00:00.000Z',
            'sumber': 'KAMERA',
            'sha256': hash,
            'ukuran': bytes.length,
            'dikirim_pada': DateTime.now().toUtc().toIso8601String(),
            // file server sudah ber-watermark; asli dari HP (kalau ada) tetap disimpan untuk render ulang
            'path_asli': asliSama,
            'wm_tanda': sama.isEmpty ? null : sama.first['wm_tanda'],
            'diambil_pada': sama.isEmpty ? null : sama.first['diambil_pada'],
            'lat': sama.isEmpty ? null : sama.first['lat'],
            'lng': sama.isEmpty ? null : sama.first['lng'],
            'akurasi_m': sama.isEmpty ? null : sama.first['akurasi_m'],
          },
          conflictAlgorithm: ConflictAlgorithm.replace,
        );
      });
      for (final x in lama) {
        final lamaPath = x['path'] as String;
        if (lamaPath != path && await File(lamaPath).exists()) await File(lamaPath).delete();
        await _hapusFile(x['path_asli'] as String?);
      }
      if (simpanGaleri) {
        try {
          await keGaleri(path, nama: '${kodeEks}_$slotFoto');
          keGaleriOk++;
        } catch (_) {/* unduhan tetap berhasil */}
      }
      n++;
      progres?.call(n, foto.length, slotFoto);
    }
    return (unduh: n, galeri: keGaleriOk);
  }

  /// v1.0.33 (permintaan kvlar 24 Okt 2026): semua foto eksekusi-eksekusi ini ke galeri (album SiSi ROW, nama
  /// Kode Eksekusi_SLOT), dipakai Download Foto Full satu penyulang dan download per eksekusi. Foto di HP disalin
  /// langsung (eksekusi belum terkirim tetap bisa); eksekusi yang fotonya belum lengkap di HP diunduh dulu dari server
  /// (unduhUlang). Tanpa sinyal = foto yang ada di HP saja. `progres(selesai, total eksekusi)`.
  Future<({int galeri, int gagal})> keGaleriEksekusi(Sesi s, List<({String id, String kode})> eksekusi,
      {void Function(int selesai, int total)? progres}) async {
    var galeri = 0, gagal = 0, n = 0;
    progres?.call(0, eksekusi.length);
    for (final e in eksekusi) {
      var foto = await _fotoDiHp(e.id);
      if (foto.length < slot.length) {
        try {
          await unduhUlang(s, e.id);
          foto = await _fotoDiHp(e.id);
        } catch (_) {/* tanpa sinyal / belum di server: pakai yang ada di HP */}
      }
      for (final f in foto) {
        try {
          await keGaleri(f.path, nama: '${e.kode}_${f.slot}');
          galeri++;
        } catch (_) {
          gagal++;
        }
      }
      progres?.call(++n, eksekusi.length);
    }
    return (galeri: galeri, gagal: gagal);
  }

  /// Foto terbaru per slot yang filenya masih ada di HP.
  Future<List<FotoLokal>> _fotoDiHp(String eksekusiId) async => [
        for (final f in (await untukEksekusi(eksekusiId)).values)
          if (await File(f.path).exists()) f,
      ];

  /// Foto GAGAL dicoba lagi pada sync berikutnya.
  Future<void> ulangiGagal(String eksekusiId) =>
      _db.db.update('foto_antre', {'status': 'TERTUNDA', 'alasan': null},
          where: 'eksekusi_id = ? AND status = ?', whereArgs: [eksekusiId, 'GAGAL']);

  Future<void> _tandai(String fotoId, String status, String? alasan) => _db.db.update(
        'foto_antre',
        {'status': status, 'alasan': alasan, 'dikirim_pada': DateTime.now().toUtc().toIso8601String()},
        where: 'foto_id = ?',
        whereArgs: [fotoId],
      );
}
