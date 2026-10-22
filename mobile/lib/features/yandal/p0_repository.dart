import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

import '../../core/jam_terpercaya.dart';
import '../../core/sesi.dart';
import '../../data/local_db.dart';
import '../row/foto_repository.dart' show FotoBaru, FotoRepository;
import '../row/row_repository.dart' show RowError;
import '../row/watermark.dart';
import 'p0_model.dart';

/// v0.64.0: P0 shift berjalan di HP (tabel yan_p0, foto di folder foto_p0, TERPISAH dari foto ROW supaya tidak ikut
/// dibersihkan pembersih foto ROW). Kirim ke server + approval menyusul di pembaruan berikutnya.
/// Shift sudah habis = tidak bisa menambah P0 / foto (P0 baru tidak boleh dibuat lewat jam shift).
class P0Repository {
  P0Repository(this._db, this._jam);

  final LocalDb _db;
  final JamTerpercaya _jam; // v0.64.2: semua waktu pekerjaan = jam terpercaya (jam server + monoton)
  static const _uuid = Uuid();
  static const int maksByte = 2 * 1024 * 1024;

  static String? shiftIdSesi(Sesi s) {
    final v = s.yandal?['shiftId'];
    return v is String && v.isNotEmpty ? v : null;
  }

  /// Cek jam shift memakai jam terpercaya (dibaca ulang dulu), bukan jam HP. Hasil: waktu yang dicatat.
  Future<WaktuTercatat> _cekShift(Sesi s) async {
    final w = await _jam.catat();
    if (s.habisShift(w.waktu)) throw RowError('Jam shift sudah habis. P0 baru tidak bisa dibuat lagi.');
    final sampai = s.sesiSampai;
    if (sampai != null && w.waktu.isBefore(jadwalShiftDari(sampai).mulai)) {
      throw RowError('Jam belum masuk jam shift. Periksa jam HP / sambungkan internet sebentar.');
    }
    return w;
  }

  Future<List<P0Lokal>> daftarShift(String userId, String shiftId) async {
    final r = await _db.db.query('yan_p0', where: 'user_id = ? AND shift_id = ?', whereArgs: [userId, shiftId], orderBy: 'no DESC');
    return [for (final x in r) P0Lokal.dariJson(Map<String, dynamic>.from(jsonDecode(x['json'] as String) as Map))];
  }

  /// v0.64.1: selalu dibatasi akun pemilik (HP bisa dipakai beberapa akun).
  Future<P0Lokal?> satu(String userId, String id) async {
    final r = await _db.db.query('yan_p0', where: 'id = ? AND user_id = ?', whereArgs: [id, userId], limit: 1);
    return r.isEmpty ? null : P0Lokal.dariJson(Map<String, dynamic>.from(jsonDecode(r.first['json'] as String) as Map));
  }

  Future<void> _tulis(P0Lokal x, {bool baru = false}) async {
    final sekarang = DateTime.now().toUtc().toIso8601String();
    final baris = {
      'id': x.id,
      'user_id': x.userId,
      'shift_id': x.shiftId,
      'no': x.no,
      'status': x.status,
      'sinkron': x.sinkron,
      'json': jsonEncode(x.keJson()),
      'diubah_pada': sekarang,
    };
    if (baru) {
      await _db.db.insert('yan_p0', {...baris, 'dibuat_pada': sekarang});
    } else {
      final n = await _db.db.update('yan_p0', baris, where: 'id = ? AND user_id = ?', whereArgs: [x.id, x.userId]);
      if (n != 1) throw RowError('P0 tidak ditemukan di HP.');
    }
  }

  /// P0 baru di shift sesi ini (status PROSES, belum ada foto).
  Future<P0Lokal> tambah(Sesi s, {required String namaPekerjaan, String pekerjaanLainnya = '', String penyulang = '',
      String section = '', String sectionId = '', String daerah = '', String catatan = ''}) async {
    final w = await _cekShift(s);
    final shiftId = shiftIdSesi(s);
    if (shiftId == null) throw RowError('Shift belum tercatat. Login ulang.');
    if (namaPekerjaan.trim().isEmpty) throw RowError('Pilih nama pekerjaan.');
    if (namaPekerjaan == pekerjaanLainLain && pekerjaanLainnya.trim().isEmpty) throw RowError('Isi Pekerjaan Lainnya.');
    final tolakLokasi = _cekLokasi(namaPekerjaan, penyulang, section, sectionId);
    if (tolakLokasi != null) throw RowError(tolakLokasi);
    final r = await _db.db.rawQuery('SELECT MAX(no) AS n FROM yan_p0 WHERE user_id = ? AND shift_id = ?', [s.userId, shiftId]);
    final no = ((r.first['n'] as int?) ?? 0) + 1;
    final x = P0Lokal(
      id: _uuid.v4(),
      userId: s.userId,
      shiftId: shiftId,
      kodeShift: '${s.yandal?['kodeShift'] ?? ''}',
      no: no,
      namaPekerjaan: namaPekerjaan.trim(),
      pekerjaanLainnya: namaPekerjaan == pekerjaanLainLain ? pekerjaanLainnya.trim() : '',
      penyulang: penyulang.trim(),
      section: section.trim(),
      sectionId: sectionId,
      daerah: daerah.trim(),
      catatan: catatan.trim(),
      dibuat: w.waktu,
      dibuatHp: w.waktuHp,
      sumberWaktu: w.sumber,
    );
    await _tulis(x, baru: true);
    return x;
  }

  /// v0.66.4: Pengecekan Switching wajib penyulang + section LBS / ACR (sama dengan cekLokasiSwitchingP0_ server).
  static String? _cekLokasi(String namaPekerjaan, String penyulang, String section, String sectionId) {
    // v0.74.0: Pengecekan Gardu wajib penyulang (gardu dipilih dari Master Gardu penyulang P0), section bebas
    if (p0Gardu(namaPekerjaan)) return penyulang.trim().isEmpty ? 'Pengecekan Gardu wajib pilih penyulang.' : null;
    if (!p0Switching(namaPekerjaan)) return null;
    if (penyulang.trim().isEmpty) return 'Pengecekan Switching wajib pilih penyulang.';
    if (sectionId.isEmpty || !switchingSah(namaSwitching(section))) return 'Pengecekan Switching wajib pilih section LBS / ACR.';
    return null;
  }

  /// v0.66.4 (keputusan kvlar 9 Okt 2026): edit penyulang / section / daerah P0 (section salah pilih).
  /// Hanya shift berjalan, P0 belum selesai, Pengecekan Switching sebelum switching disimpan. Sudah terkirim =
  /// dikirim ulang ke server (simpanP0Yandal ubahLokasi) pada sync berikutnya.
  Future<P0Lokal> ubahLokasi(Sesi s, P0Lokal x,
      {required String penyulang, required String section, required String sectionId, required String daerah}) async {
    final w = await _cekShift(s);
    final kini = await satu(s.userId, x.id);
    if (kini == null || kini.userId != s.userId || kini.shiftId != shiftIdSesi(s)) throw RowError('P0 ini bukan milik shift yang sedang berjalan.');
    final alasan = kini.alasanTidakUbahLokasi;
    if (alasan != null) throw RowError(alasan);
    if (sectionId.isNotEmpty && penyulang.trim().isEmpty) throw RowError('Pilih penyulang section ini.');
    final tolak = _cekLokasi(kini.namaPekerjaan, penyulang, section, sectionId);
    if (tolak != null) throw RowError(tolak);
    if (kini.ukurGardu != null && penyulang.trim().toLowerCase() != kini.penyulang.trim().toLowerCase()) {
      throw RowError(kini.ukurGardu!.disimpan
          ? 'Penyulang terkunci: pengukuran gardu ${kini.ukurGardu!.noGardu} sudah disimpan.'
          : 'Sudah ada foto ukur gardu ${kini.ukurGardu!.noGardu}. Hapus foto draf dulu untuk ganti penyulang.'); // v0.74.0
    }
    final baru = kini.denganLokasi(
        penyulang: penyulang.trim(), section: section.trim(), sectionId: sectionId, daerah: daerah.trim(), diubah: w.waktu);
    await _tulis(baru);
    return baru;
  }

  /// Hapus P0 yang belum ada fotonya (salah buat). Yang sudah ada foto tidak bisa dihapus dari HP.
  Future<void> hapus(P0Lokal x) async {
    if (x.foto.isNotEmpty) throw RowError('P0 yang sudah ada fotonya tidak bisa dihapus.');
    final kini = await satu(x.userId, x.id);
    if (kini != null && kini.terkirim) throw RowError('P0 sudah terkirim ke server, tidak bisa dihapus.');   // v0.65.0
    await _db.db.delete('yan_p0', where: 'id = ? AND user_id = ?', whereArgs: [x.id, x.userId]);
  }

  /// Isi watermark foto P0 (baris sama dengan ROW: Kode P0, ULP, Tim, Petugas, Penyulang, Section, Waktu, Koordinat, Pekerjaan).
  static DataWatermark watermark(Sesi s, P0Lokal x, String slot, DateTime waktu,
          {String sumber = 'KAMERA', double? lat, double? lng, double? akurasiM, int? gpsSusulanDetik}) =>
      DataWatermark(
        kodeEksekusi: x.kodeWatermark,
        ulp: s.ulp,
        tim: s.timNama,
        subTim: s.petugasShift.join(', '),
        penyulang: x.penyulang,
        section: [x.section, x.daerah].where((v) => v.isNotEmpty).join(' · '),
        waktu: waktu,
        koordinat: lat == null || lng == null ? null : '${lat.toStringAsFixed(6)}, ${lng.toStringAsFixed(6)}',
        akurasiM: akurasiM,
        diameter: null,
        jenis: x.namaTampil,
        slot: labelSlotP0[slot] ?? slot,
        sumber: sumber,
        labelKode: 'Kode P0',
        labelSubTim: 'Petugas',
        tampilDiameter: false,
        gpsSusulanDetik: lat == null || lng == null ? null : gpsSusulanDetik,
      );

  // ---------------- v0.65.0: kirim ke server ----------------

  /// Ubah status kirim P0 tanpa menimpa perubahan petugas yang terjadi selama kirim (dibaca ulang dulu).
  Future<P0Lokal?> ubahStatusKirim(String userId, String id, P0Lokal Function(P0Lokal kini) ubah) async {
    final kini = await satu(userId, id);
    if (kini == null) return null;
    final baru = ubah(kini);
    await _tulis(baru);
    return baru;
  }

  /// Akhir shift: foto yang belum disimpan dikunci otomatis supaya ikut terkirim (tanpa cek jam shift).
  Future<P0Lokal> kunciAkhirShift(P0Lokal x) async =>
      (await ubahStatusKirim(x.userId, x.id, (k) => k.belumDisimpan.isEmpty ? k : k.denganFotoDikunci())) ?? x;

  /// Jumlah P0 shift sesi ini yang masih perlu dikirim (gerbang sync akhir shift + tanda belum terkirim).
  Future<int> jumlahTertunda(Sesi s, {required bool akhirShift}) async {
    final id = shiftIdSesi(s);
    if (id == null) return 0;
    return (await daftarShift(s.userId, id)).where((x) => x.perluKirim(akhirShift: akhirShift)).length;
  }

  /// v0.64.7: tombol Simpan Foto. Semua foto P0 yang belum disimpan dikunci (tidak bisa diambil ulang lagi);
  /// tahap berikutnya baru bisa difoto sesudah ini. Hanya P0 milik akun + shift yang sedang berjalan.
  Future<P0Lokal> kunciFoto(Sesi s, P0Lokal x) async {
    await _cekShift(s);
    if (x.userId != s.userId || x.shiftId != shiftIdSesi(s)) throw RowError('P0 ini bukan milik shift yang sedang berjalan.');
    final kini = await satu(s.userId, x.id);
    if (kini == null) throw RowError('P0 tidak ditemukan di HP.');
    if (kini.belumDisimpan.isEmpty) return kini;
    final baru = kini.denganFotoDikunci();
    await _tulis(baru);
    return baru;
  }

  /// v0.65.3: umur foto sejak jepret yang dipakai mengurangi jam simpan (0..10 menit; negatif / null = 0).
  static Duration umurFoto(Duration? d) {
    if (d == null || d.isNegative) return Duration.zero;
    const maks = Duration(minutes: 10);
    return d > maks ? maks : d;
  }

  /// Simpan foto satu tahap: kamera = watermark + landscape wajib, galeri = hanya diperkecil (sama dengan ROW).
  /// Foto lama di slot itu dibuang setelah yang baru tersimpan.
  /// v0.65.5: `kunci` = foto langsung disimpan (diverifikasi di review kamera), tidak bisa diambil ulang.
  Future<P0Lokal> simpanFoto(Sesi s, P0Lokal x, String slot, FotoBaru foto, {bool kunci = false}) async {
    // v0.64.1 (audit guard): hanya P0 milik akun + shift yang sedang berjalan, foto wajib kamera SiSi.
    // v0.64.2: waktu foto = jam terpercaya saat foto disimpan (bukan jam HP), wajib di dalam jam shift.
    final w = await _cekShift(s);
    if (x.userId != s.userId || x.shiftId != shiftIdSesi(s)) throw RowError('P0 ini bukan milik shift yang sedang berjalan.');
    if (foto.sumber != 'KAMERA') throw RowError('Foto P0 wajib dari kamera SiSi.');
    // v0.65.3: foto direview dulu di kamera. Waktu foto = saat JEPRET (jam terpercaya sekarang - umur monoton), maks 10 menit.
    final umur = umurFoto(foto.sejakJepret?.elapsed);
    if (w.waktu.subtract(umur).isBefore(x.dibuat.subtract(const Duration(minutes: 1)))) throw RowError('Jam foto lebih awal dari P0 dibuat. Periksa jam HP.');
    final tolakUlang = x.alasanTidakUlang(slot);   // v0.64.5 / v0.64.7: foto yang sudah disimpan terkunci
    if (tolakUlang != null) throw RowError(tolakUlang);
    if (!x.bolehFoto(slot)) throw RowError(x.alasanBelumBoleh(slot) ?? 'Foto ini belum bisa diambil.');
    final bytes = await foto.file.readAsBytes();
    if (bytes.length < 4 || bytes[0] != 0xFF || bytes[1] != 0xD8) throw RowError('Foto harus JPEG. Ambil ulang pakai kamera.');
    final kamera = foto.sumber == 'KAMERA';
    if (kamera && !await Watermark.landscape(bytes)) throw RowError(FotoRepository.pesanLandscape);
    final waktu = w.waktu.subtract(umur);
    final Uint8List akhir;
    try {
      final dasar = await Watermark.perkecil(bytes);
      akhir = kamera
          ? await Watermark.pasang(dasar, watermark(s, x, slot, waktu,
              lat: foto.lat, lng: foto.lng, akurasiM: foto.akurasiM, gpsSusulanDetik: foto.gpsSusulanDetik))
          : dasar;
    } catch (_) {
      throw RowError(kamera ? 'Watermark gagal dibuat. Ambil ulang foto.' : 'Foto galeri tidak bisa dibaca. Pilih foto lain.');
    }
    if (akhir.length > maksByte) throw RowError('Foto lebih dari 2 MB. Ambil ulang.');
    final dir = Directory(p.join((await getApplicationDocumentsDirectory()).path, 'foto_p0', x.userId));
    await dir.create(recursive: true);
    final path = p.join(dir.path, '${x.id}_${slot}_${_uuid.v4().substring(0, 8)}.jpg');
    await File(path).writeAsBytes(akhir, flush: true);
    final lama = x.foto[slot]?.path;
    final baru = x.denganFoto(slot,
        FotoP0(path: path, waktu: waktu, sumber: foto.sumber, lat: foto.lat, lng: foto.lng, akurasiM: foto.akurasiM,
            waktuHp: w.waktuHp.subtract(umur), sumberWaktu: w.sumber,
            gpsSusulanDetik: foto.lat == null || foto.lng == null ? null : foto.gpsSusulanDetik,
            terkunci: kunci));
    try {
      await _tulis(baru);
    } catch (_) {
      try {
        await File(path).delete();
      } catch (_) {/* dibiarkan */}
      rethrow;
    }
    if (lama != null && lama != path) {
      try {
        final f = File(lama);
        if (await f.exists()) await f.delete();
      } catch (_) {/* dibiarkan */}
    }
    return baru;
  }

  // ---------------- v0.66.0: Pengecekan Switching ----------------

  /// P0 terbaru milik akun + shift berjalan (dibaca ulang supaya perubahan lain tidak tertimpa).
  Future<P0Lokal> _p0Shift(Sesi s, P0Lokal x) async {
    if (x.userId != s.userId || x.shiftId != shiftIdSesi(s)) throw RowError('P0 ini bukan milik shift yang sedang berjalan.');
    final kini = await satu(s.userId, x.id);
    if (kini == null) throw RowError('P0 tidak ditemukan di HP.');
    return kini;
  }

  /// v0.75.0: Simpan Switching = draf (foto sudah diambil) jadi data tersimpan bersama fotonya. Section = section P0
  /// (wajib LBS / ACR), indikator Nyala / Padam, arus 0 - 5000 A, Foto Arus wajib sudah ada.
  Future<P0Lokal> tambahSwitching(Sesi s, P0Lokal x,
      {required Map<String, String> indikator,
      required double arusR,
      required double arusS,
      required double arusT,
      String catatan = ''}) async {
    final w = await _cekShift(s);
    final kini = await _p0Shift(s, x);
    if (!kini.butuhSwitching) throw RowError('P0 ini bukan Pengecekan Switching.');
    if (kini.selesai) throw RowError('P0 sudah selesai. Switching tidak bisa ditambah.');
    if (kini.switching.any((e) => e.disimpan)) throw RowError('P0 ini sudah punya data switching (1 switching per P0).');
    if (!kini.bolehTambahSwitching) throw RowError('Simpan foto Sebelum dulu.');
    if (kini.namaSwitchingP0.isEmpty) throw RowError('Section P0 bukan LBS / ACR. Ubah section lewat tombol Edit di data P0.');
    for (final n in namaIndikator) {
      if (!pilihanIndikator.contains(indikator[n])) throw RowError('Pilih indikator $n (Nyala / Padam).');
    }
    for (final a in [arusR, arusS, arusT]) {
      if (!a.isFinite || a < 0 || a > 5000) throw RowError('Arus R / S / T harus angka 0 - 5000 A.');
    }
    final draf = kini.switching.isEmpty ? null : kini.switching.first;
    if (draf == null || !draf.adaFotoArus) throw RowError('Ambil Foto Arus dulu, lalu simpan bersamaan.');
    final baru = kini.ubahSwitching(
        draf.id,
        (e) => e.disimpanDari(
            indikator: {for (final n in namaIndikator) n: indikator[n]!}, arusR: arusR, arusS: arusS, arusT: arusT,
            catatan: catatan.trim(), dibuat: w.waktu));
    await _tulis(baru);
    return baru;
  }

  /// Contoh switching untuk pratinjau watermark sebelum draf ada (section P0).
  static SwitchingLokal switchingPratinjau(P0Lokal x, DateTime waktu) => SwitchingLokal(
      id: '', no: 1, sectionId: x.sectionId, section: x.section, indikator: const {}, arusR: 0, arusS: 0, arusT: 0,
      dibuat: waktu, disimpan: false);

  /// Hapus draf switching (foto belum disimpan sebagai data), mis. section salah. Data tersimpan tidak bisa dihapus.
  Future<P0Lokal> buangDrafSwitching(Sesi s, P0Lokal x) async {
    await _cekShift(s);
    final kini = await _p0Shift(s, x);
    final draf = [for (final e in kini.switching) if (!e.disimpan) e];
    if (draf.isEmpty) return kini;
    final baru = kini.denganSwitching([for (final e in kini.switching) if (e.disimpan) e]);
    await _tulis(baru);
    await _hapusFile([for (final e in draf) for (final f in e.foto.values) f.path]);
    return baru;
  }

  Future<void> _hapusFile(List<String> path) async {
    for (final x in path) {
      try {
        final f = File(x);
        if (await f.exists()) await f.delete();
      } catch (_) {/* dibiarkan */}
    }
  }

  /// Ubah Arus R/S/T (satu-satunya data switching yang boleh diubah), selama P0 belum selesai.
  Future<P0Lokal> ubahArusSwitching(Sesi s, P0Lokal x, String switchingId, double r, double sArus, double t) async {
    await _cekShift(s);
    final kini = await _p0Shift(s, x);
    if (kini.selesai) throw RowError('P0 sudah selesai. Arus tidak bisa diubah.');
    if (kini.switchingId(switchingId) == null) throw RowError('Switching tidak ditemukan di HP.');
    for (final a in [r, sArus, t]) {
      if (!a.isFinite || a < 0 || a > 5000) throw RowError('Arus R / S / T harus angka 0 - 5000 A.');
    }
    final baru = kini.ubahSwitching(switchingId, (w) => w.denganArus(r, sArus, t));
    await _tulis(baru);
    return baru;
  }

  /// Watermark foto switching: Kode Switching, penyulang, section, jenis `Pengecekan Switching · nama switching`.
  static DataWatermark watermarkSwitching(Sesi s, P0Lokal x, SwitchingLokal w, String slot, DateTime waktu,
          {double? lat, double? lng, double? akurasiM, int? gpsSusulanDetik}) =>
      DataWatermark(
        kodeEksekusi: w.kodeTampil(x),
        ulp: s.ulp,
        tim: s.timNama,
        subTim: s.petugasShift.join(', '),
        penyulang: x.penyulang,
        section: w.section,
        waktu: waktu,
        koordinat: lat == null || lng == null ? null : '${lat.toStringAsFixed(6)}, ${lng.toStringAsFixed(6)}',
        akurasiM: akurasiM,
        diameter: null,
        jenis: '$pekerjaanSwitching · ${w.nama}',
        slot: labelSlotSwitching[slot] ?? slot,
        labelKode: 'Kode Switching',
        labelSubTim: 'Petugas',
        tampilDiameter: false,
        gpsSusulanDetik: lat == null || lng == null ? null : gpsSusulanDetik,
      );

  /// Simpan foto switching dari review kamera (langsung terkunci), tanpa ambil ulang. v0.75.0: boleh sebelum data
  /// disimpan: switching belum ada = draf dibuat (section P0), isian sementara ([indikatorDraf], [isianDraf]) ikut disimpan.
  Future<P0Lokal> simpanFotoSwitching(Sesi s, P0Lokal x, String slot, FotoBaru foto,
      {Map<String, String>? indikatorDraf, Map<String, String>? isianDraf}) async {
    final w = await _cekShift(s);
    var kini = await _p0Shift(s, x);
    if (foto.sumber != 'KAMERA') throw RowError('Foto switching wajib dari kamera SiSi.');
    if (kini.selesai) throw RowError('P0 sudah selesai. Foto switching tidak bisa ditambah.');
    if (kini.switching.isEmpty) {
      if (!kini.butuhSwitching) throw RowError('P0 ini bukan Pengecekan Switching.');
      if (!(kini.foto['SEBELUM']?.terkunci ?? false)) throw RowError('Simpan foto Sebelum dulu.');
      if (kini.namaSwitchingP0.isEmpty) throw RowError('Section P0 bukan LBS / ACR. Ubah section lewat tombol Edit di data P0.');
      kini = kini.denganSwitching([
        SwitchingLokal(
            id: _uuid.v4(), no: 1, sectionId: kini.sectionId, section: kini.section, indikator: const {},
            arusR: 0, arusS: 0, arusT: 0, dibuat: w.waktu, disimpan: false),
      ]);
    }
    final sw = kini.switching.first;
    if (!sw.bolehFoto(slot)) throw RowError(sw.alasanBelumBoleh(slot) ?? 'Foto ini belum bisa diambil.');
    final umur = umurFoto(foto.sejakJepret?.elapsed);
    final waktu = w.waktu.subtract(umur);
    final bytes = await foto.file.readAsBytes();
    if (bytes.length < 4 || bytes[0] != 0xFF || bytes[1] != 0xD8) throw RowError('Foto harus JPEG. Ambil ulang pakai kamera.');
    if (!await Watermark.landscape(bytes)) throw RowError(FotoRepository.pesanLandscape);
    final Uint8List akhir;
    try {
      akhir = await Watermark.pasang(await Watermark.perkecil(bytes),
          watermarkSwitching(s, kini, sw, slot, waktu,
              lat: foto.lat, lng: foto.lng, akurasiM: foto.akurasiM, gpsSusulanDetik: foto.gpsSusulanDetik));
    } catch (_) {
      throw RowError('Watermark gagal dibuat. Ambil ulang foto.');
    }
    if (akhir.length > maksByte) throw RowError('Foto lebih dari 2 MB. Ambil ulang.');
    final dir = Directory(p.join((await getApplicationDocumentsDirectory()).path, 'foto_p0', x.userId));
    await dir.create(recursive: true);
    final path = p.join(dir.path, '${x.id}_SWC${sw.no}_${slot}_${_uuid.v4().substring(0, 8)}.jpg');
    await File(path).writeAsBytes(akhir, flush: true);
    final f = FotoP0(path: path, waktu: waktu, sumber: foto.sumber, lat: foto.lat, lng: foto.lng, akurasiM: foto.akurasiM,
        waktuHp: w.waktuHp.subtract(umur), sumberWaktu: w.sumber,
        gpsSusulanDetik: foto.lat == null || foto.lng == null ? null : foto.gpsSusulanDetik, terkunci: true);
    final baru = kini.ubahSwitching(sw.id, (e) {
      final d = e.denganFoto(slot, f);
      return !d.disimpan && (indikatorDraf != null || isianDraf != null)
          ? d.denganDraf(indikatorDraf ?? d.indikator, isianDraf ?? d.isianDraf)
          : d;
    });
    try {
      await _tulis(baru);
    } catch (_) {
      await _hapusFile([path]);
      rethrow;
    }
    return baru;
  }

  // ---------------- v0.74.0: Pengecekan Gardu ----------------

  /// Cek angka ukur: 10 nilai wajib, 0..3000 A (beban) / 0..1000 V (tegangan). Hasil: pesan salah atau null.
  static String? cekNilaiGardu(Map<String, double?> n) {
    for (final v in nilaiGardu) {
      final a = n[v.kunci];
      final maks = v.beban ? bebanGarduMaks : teganganGarduMaks;
      if (a == null) return 'Isi ${v.label} (${v.satuan}).';
      if (!a.isFinite || a < 0 || a > maks) return '${v.label} harus angka 0 - ${maks.toStringAsFixed(0)} ${v.satuan}.';
    }
    return null;
  }

  /// v0.75.0: Simpan Pengukuran = draf (gardu + foto) jadi pengukuran tersimpan bersama fotonya: 10 angka valid dan
  /// 10 foto wajib sudah ada (Kondisi / Temuan opsional, boleh menyusul). Satu per P0.
  Future<P0Lokal> tambahUkurGardu(Sesi s, P0Lokal x, {required Map<String, double?> nilai, String catatan = ''}) async {
    final w = await _cekShift(s);
    final kini = await _p0Shift(s, x);
    if (!kini.butuhGardu) throw RowError('P0 ini bukan Pengecekan Gardu.');
    if (kini.selesai) throw RowError('P0 sudah selesai. Pengukuran tidak bisa ditambah.');
    final g = kini.ukurGardu;
    if (g != null && g.disimpan) throw RowError('P0 ini sudah punya pengukuran gardu (1 gardu per P0).');
    if (!kini.bolehTambahGardu) throw RowError('Simpan foto Sebelum dulu.');
    if (g == null) throw RowError('Pilih gardu lalu ambil foto tiap nilai ukur dulu.');
    final salah = cekNilaiGardu(nilai);
    if (salah != null) throw RowError(salah);
    if (catatan.trim().length > 300) throw RowError('Catatan maksimal 300 karakter.');
    if (!g.lengkapFotoWajib) throw RowError('Lengkapi foto ukur dulu (${g.jumlahFotoWajib} dari ${slotGarduWajib.length}).');
    final baru = kini.ubahUkurGardu((e) => e.disimpanDari({for (final v in nilaiGardu) v.kunci: nilai[v.kunci]!}, catatan.trim(), w.waktu));
    await _tulis(baru);
    return baru;
  }

  /// Hapus draf pengukuran (mis. ganti gardu): foto draf ikut dihapus. Pengukuran tersimpan tidak bisa dihapus.
  Future<P0Lokal> buangDrafGardu(Sesi s, P0Lokal x) async {
    await _cekShift(s);
    final kini = await _p0Shift(s, x);
    final g = kini.ukurGardu;
    if (g == null || g.disimpan) return kini;
    final baru = kini.denganUkurGardu(null);
    await _tulis(baru);
    await _hapusFile([for (final f in g.foto.values) f.path]);
    return baru;
  }

  /// Koreksi angka + catatan pengukuran (gardu tetap), selama P0 belum selesai.
  Future<P0Lokal> ubahUkurGardu(Sesi s, P0Lokal x, {required Map<String, double?> nilai, required String catatan}) async {
    await _cekShift(s);
    final kini = await _p0Shift(s, x);
    if (kini.selesai) throw RowError('P0 sudah selesai. Pengukuran tidak bisa diubah.');
    if (kini.ukurGardu == null || !kini.ukurGardu!.disimpan) throw RowError('Pengukuran gardu belum disimpan.');
    final salah = cekNilaiGardu(nilai);
    if (salah != null) throw RowError(salah);
    if (catatan.trim().length > 300) throw RowError('Catatan maksimal 300 karakter.');
    final baru = kini.ubahUkurGardu((g) => g.denganNilai({for (final v in nilaiGardu) v.kunci: nilai[v.kunci]!}, catatan.trim()));
    await _tulis(baru);
    return baru;
  }

  /// Watermark foto ukur gardu: Kode Ukur, penyulang, No Gardu + section, jenis `Pengecekan Gardu · No Gardu`,
  /// bagian foto = nilai yang diukur (mis. "Beban R").
  static DataWatermark watermarkGardu(Sesi s, P0Lokal x, GarduUkurLokal g, String slot, DateTime waktu,
          {double? lat, double? lng, double? akurasiM, int? gpsSusulanDetik}) =>
      DataWatermark(
        kodeEksekusi: g.kodeTampil(x),
        ulp: s.ulp,
        tim: s.timNama,
        subTim: s.petugasShift.join(', '),
        penyulang: x.penyulang,
        section: [g.noGardu, g.section].where((v) => v.isNotEmpty).join(' · '),
        waktu: waktu,
        koordinat: lat == null || lng == null ? null : '${lat.toStringAsFixed(6)}, ${lng.toStringAsFixed(6)}',
        akurasiM: akurasiM,
        diameter: null,
        jenis: '$pekerjaanGardu · ${g.noGardu}',
        slot: labelSlotGardu[slot] ?? slot,
        labelKode: 'Kode Ukur',
        labelSubTim: 'Petugas',
        tampilDiameter: false,
        gpsSusulanDetik: lat == null || lng == null ? null : gpsSusulanDetik,
      );

  /// Simpan foto ukur gardu dari review kamera (langsung terkunci), tanpa ambil ulang. v0.75.0: boleh sebelum angka
  /// disimpan: belum ada pengukuran = draf dibuat dari [drafBaru] (gardu terpilih, wajib penyulang P0); isian angka
  /// yang valid ([nilaiDraf]) + catatan ikut disimpan sementara.
  Future<P0Lokal> simpanFotoGardu(Sesi s, P0Lokal x, String slot, FotoBaru foto,
      {GarduUkurLokal? drafBaru, String penyulangGardu = '', Map<String, double>? nilaiDraf, String? catatanDraf}) async {
    final w = await _cekShift(s);
    var kini = await _p0Shift(s, x);
    if (foto.sumber != 'KAMERA') throw RowError('Foto ukur gardu wajib dari kamera SiSi.');
    if (kini.selesai) throw RowError('P0 sudah selesai. Foto ukur tidak bisa ditambah.');
    if (kini.ukurGardu == null) {
      if (!kini.butuhGardu) throw RowError('P0 ini bukan Pengecekan Gardu.');
      if (!(kini.foto['SEBELUM']?.terkunci ?? false)) throw RowError('Simpan foto Sebelum dulu.');
      final d = drafBaru;
      if (d == null || d.garduId.isEmpty) throw RowError('Pilih gardu dulu.');
      if (penyulangGardu.trim().toLowerCase() != kini.penyulang.trim().toLowerCase()) {
        throw RowError('Gardu ${d.noGardu} bukan di penyulang ${kini.penyulang}.');
      }
      kini = kini.denganUkurGardu(GarduUkurLokal(
          id: _uuid.v4(), garduId: d.garduId, noGardu: d.noGardu, alamat: d.alamat, section: d.section, kapasitas: d.kapasitas,
          garduLat: d.garduLat, garduLng: d.garduLng, nilai: const {}, dibuat: w.waktu, disimpan: false));
    }
    final g = kini.ukurGardu!;
    if (!g.bolehFoto(slot)) throw RowError(g.alasanBelumBoleh(slot) ?? 'Foto ini belum bisa diambil.');
    final umur = umurFoto(foto.sejakJepret?.elapsed);
    final waktu = w.waktu.subtract(umur);
    final bytes = await foto.file.readAsBytes();
    if (bytes.length < 4 || bytes[0] != 0xFF || bytes[1] != 0xD8) throw RowError('Foto harus JPEG. Ambil ulang pakai kamera.');
    if (!await Watermark.landscape(bytes)) throw RowError(FotoRepository.pesanLandscape);
    final Uint8List akhir;
    try {
      akhir = await Watermark.pasang(await Watermark.perkecil(bytes),
          watermarkGardu(s, kini, g, slot, waktu,
              lat: foto.lat, lng: foto.lng, akurasiM: foto.akurasiM, gpsSusulanDetik: foto.gpsSusulanDetik));
    } catch (_) {
      throw RowError('Watermark gagal dibuat. Ambil ulang foto.');
    }
    if (akhir.length > maksByte) throw RowError('Foto lebih dari 2 MB. Ambil ulang.');
    final dir = Directory(p.join((await getApplicationDocumentsDirectory()).path, 'foto_p0', x.userId));
    await dir.create(recursive: true);
    final path = p.join(dir.path, '${x.id}_GRD_${slot}_${_uuid.v4().substring(0, 8)}.jpg');
    await File(path).writeAsBytes(akhir, flush: true);
    final f = FotoP0(path: path, waktu: waktu, sumber: foto.sumber, lat: foto.lat, lng: foto.lng, akurasiM: foto.akurasiM,
        waktuHp: w.waktuHp.subtract(umur), sumberWaktu: w.sumber,
        gpsSusulanDetik: foto.lat == null || foto.lng == null ? null : foto.gpsSusulanDetik, terkunci: true);
    final baru = kini.ubahUkurGardu((e) {
      final d = e.denganFoto(slot, f);
      return !d.disimpan && (nilaiDraf != null || catatanDraf != null) ? d.denganDraf(nilaiDraf ?? d.nilai, catatanDraf ?? d.catatan) : d;
    });
    try {
      await _tulis(baru);
    } catch (_) {
      await _hapusFile([path]);
      rethrow;
    }
    return baru;
  }
}
