import 'dart:convert';
import 'dart:io';

import 'package:sqflite/sqflite.dart';

import '../../core/sesi.dart';
import '../../core/wib.dart';
import '../../data/local_db.dart';
import 'kode_row.dart';
import 'row_outbox.dart';
import 'row_repository.dart';

/// Alasan batal (M4, keputusan 6 Okt 2026). Kunci = nilai yang dikirim ke server (isi.alasan).
const Map<String, String> alasanBatalRow = {
  'SALAH_INPUT': 'Salah input',
  'DOBEL': 'Data dobel',
  'SALAH_LOKASI': 'Salah penyulang / section',
  'LAINNYA': 'Lainnya',
};

/// Isi dialog konfirmasi batal: berapa yang dibatalkan di server dan berapa yang langsung dihapus dari HP.
class RencanaBatal {
  int header = 0, realisasi = 0, eksekusi = 0;
  int dihapus = 0; // belum pernah diterima server: langsung dihapus dari HP
  int dibatalkan = 0; // sudah di server: dikirim sebagai BATAL

  int get total => header + realisasi + eksekusi;

  String get ringkas => [
        if (header > 0) '$header header',
        if (realisasi > 0) '$realisasi penyulang',
        if (eksekusi > 0) '$eksekusi eksekusi',
      ].join(', ');
}

/// Satu masalah sinkron (operasi outbox KONFLIK / DITOLAK) untuk layar Pusat Masalah.
class MasalahSync {
  MasalahSync(this.op, this.kode, this.tanggal);
  final Map<String, Object?> op;
  final String kode;
  final String? tanggal;

  String get opId => op['op_id'] as String;
  String get jenis => op['jenis'] as String;
  String get aksi => op['aksi'] as String;
  String get id => op['id'] as String;
  String get status => op['status'] as String;
  String get alasan => (op['alasan'] as String?) ?? status;

  /// Jenis tindakan yang ditawarkan layar (bagian 4.C-F spesifikasi M4).
  String get tipe {
    // INDUK_TIDAK_ADA: induk belum di server (mis. induknya HEADER_GANDA di kiriman sebelumnya), ikut beres bersama induk.
    if (alasan == 'INDUK_BENTROK' || alasan == 'INDUK_GAGAL' || alasan == 'INDUK_TIDAK_ADA') return 'IKUT_INDUK';
    if (status == 'KONFLIK' && aksi == 'buat') return 'BENTROK';
    if (alasan == 'KONFLIK_REVISION') return 'REVISI';
    if (alasan == 'HEADER_GANDA' && jenis == 'header') return 'HEADER_GANDA';
    if (alasan == 'PENYULANG_GANDA' && jenis == 'realisasi') return 'PENYULANG_GANDA';
    if (alasan == 'DATA_TERKUNCI' || alasan == 'TANGGAL_DI_LUAR_BATAS') return 'TERKUNCI';
    if (aksi != 'buat') return 'BUANG'; // ubah / batal ditolak: buang lalu pakai data server
    if (jenis != 'realisasi' && _alasanValidasi.contains(alasan)) return 'PERBAIKI';
    return 'HAPUS';
  }

  static const _alasanValidasi = {
    'FORMAT_SALAH', 'KOORDINAT_DI_LUAR_AREA', 'KM_AKHIR_KURANG', 'DI_LUAR_RENTANG', 'FIELD_WAJIB', 'TIPE_SALAH',
    'PILIHAN_TIDAK_VALID', 'TERLALU_PANJANG', 'TERLALU_BANYAK_BARIS', 'DIAMETER_TIDAK_VALID', 'JENIS_TIDAK_SESUAI',
    'SECTION_TIDAK_ADA', 'SECTION_BEDA_PENYULANG', 'JENIS_TIDAK_ADA',
  };
}

/// M4 (PRD 13. Spesifikasi M4): Hapus, Batal berantai + Urungkan, Minta nomor baru, Gabungkan ke header /
/// penyulang server, konflik revisi, buang operasi ditolak. Semua tulis dalam SATU transaksi.
/// Pemanggil wajib membungkus dengan SyncController.tanpaSync supaya tidak bertabrakan dengan kiriman yang sedang jalan.
class PerbaikanRepository {
  PerbaikanRepository(this._db, this._outbox);

  final LocalDb _db;
  final RowOutbox _outbox;

  Database get _d => _db.db;
  String _sekarang() => DateTime.now().toUtc().toIso8601String();

  static const _tabel = {'header': 'row_header', 'realisasi': 'row_realisasi', 'eksekusi': 'row_eksekusi'};
  static const _kolomInduk = {'realisasi': 'header_id', 'eksekusi': 'realisasi_id'};

  /// Tanggal data dari kode (YYMMDD di kode header, ikut di kode PNY / EKS).
  static String? tanggalDariKode(String kode) {
    final m = RegExp(r'^R\d{2}-\d{5}(\d{2})(\d{2})(\d{2})').firstMatch(kode);
    return m == null ? null : '20${m.group(1)}-${m.group(2)}-${m.group(3)}';
  }

  /// Masih dalam jendela 7 hari server (lebih tua = DATA_TERKUNCI).
  static bool dalamBatas(String kode) {
    final t = tanggalDariKode(kode);
    return t != null && t.compareTo(Wib.tanggal(DateTime.now().subtract(const Duration(days: 7)))) >= 0;
  }

  void _pastikanBoleh(Sesi s) {
    if (!s.bisaUbah('ROW_EKSEKUSI')) throw RowError('Akun ini tidak punya akses ubah ROW.');
  }

  Future<Map<String, Object?>?> _baris(DatabaseExecutor ex, String jenis, String id) async {
    final r = await ex.query(_tabel[jenis]!, where: 'id = ?', whereArgs: [id], limit: 1);
    return r.isEmpty ? null : r.first;
  }

  /// Data + turunannya, anak dulu (eksekusi, realisasi, header). [status] null = semua status.
  Future<List<({String jenis, Map<String, Object?> row})>> _pohon(DatabaseExecutor ex, String jenis, String id,
      {String? status}) async {
    final akar = await _baris(ex, jenis, id);
    if (akar == null) return const [];
    final f = status == null ? '' : ' AND status = ?';
    final eks = <Map<String, Object?>>[];
    final real = <Map<String, Object?>>[];
    if (jenis == 'header') {
      real.addAll(await ex.query('row_realisasi', where: 'header_id = ?$f', whereArgs: [id, if (status != null) status]));
    }
    if (jenis == 'realisasi') real.add(akar);
    for (final r in real) {
      eks.addAll(await ex.query('row_eksekusi', where: 'realisasi_id = ?$f', whereArgs: [r['id'], if (status != null) status]));
    }
    if (jenis == 'eksekusi') eks.add(akar);
    return [
      for (final e in eks) (jenis: 'eksekusi', row: e),
      for (final r in real) (jenis: 'realisasi', row: r),
      if (jenis == 'header') (jenis: 'header', row: akar),
    ];
  }

  // ---------- A + B: hapus / batal ----------

  Future<RencanaBatal> rencanaBatal(String userId, String jenis, String id) async {
    final r = RencanaBatal();
    for (final n in await _pohon(_d, jenis, id, status: 'AKTIF')) {
      switch (n.jenis) {
        case 'header':
          r.header++;
        case 'realisasi':
          r.realisasi++;
        default:
          r.eksekusi++;
      }
      if (await _outbox.belumDiterima(_d, userId, n.row['id'] as String)) {
        r.dihapus++;
      } else {
        r.dibatalkan++;
      }
    }
    return r;
  }

  /// Batal berantai: yang belum pernah diterima server dihapus dari HP, sisanya jadi operasi batal (dengan alasan).
  Future<RencanaBatal> batalkan(Sesi s, String jenis, String id, {required String alasan, String? catatan}) async {
    _pastikanBoleh(s);
    if (!alasanBatalRow.containsKey(alasan)) throw RowError('Pilih alasan batal.');
    final c = catatan?.trim().replaceAll(RegExp(r'\s+'), ' ');
    if (alasan == 'LAINNYA' && (c == null || c.isEmpty)) throw RowError('Tulis catatan untuk alasan Lainnya.');
    final hasil = RencanaBatal();
    final file = <String>[];
    await _d.transaction((tx) async {
      final akar = await _baris(tx, jenis, id);
      if (akar == null || akar['status'] != 'AKTIF') throw RowError('Data sudah BATAL atau tidak ada.');
      if (!dalamBatas(akar['kode'] as String)) throw RowError('Terkunci (lebih dari 7 hari). Hubungi admin.');
      for (final n in await _pohon(tx, jenis, id, status: 'AKTIF')) {
        final nid = n.row['id'] as String;
        switch (n.jenis) {
          case 'header':
            hasil.header++;
          case 'realisasi':
            hasil.realisasi++;
          default:
            hasil.eksekusi++;
        }
        if (await _outbox.belumDiterima(tx, s.userId, nid)) {
          file.addAll(await _hapusBaris(tx, s.userId, n.jenis, nid));
          hasil.dihapus++;
          continue;
        }
        await _outbox.hapusUntuk(tx, s.userId, nid, aksi: 'ubah'); // perubahan data yang dibatalkan tidak perlu dikirim
        await tx.update(_tabel[n.jenis]!, {'status': 'BATAL', 'sinkron': 'LOKAL', 'alasan': null, 'diubah_pada': _sekarang()},
            where: 'id = ?', whereArgs: [nid]);
        await _outbox.tambah(
          ex: tx,
          userId: s.userId,
          jenis: n.jenis,
          aksi: 'batal',
          id: nid,
          indukId: _kolomInduk[n.jenis] == null ? null : n.row[_kolomInduk[n.jenis]] as String?,
          kode: n.row['kode'] as String,
          revision: (n.row['revision'] as int?) ?? 0,
          isi: {'alasan': alasan, if (c != null && c.isNotEmpty) 'catatan': c.length > 100 ? c.substring(0, 100) : c},
        );
        hasil.dibatalkan++;
      }
    });
    await _hapusFile(file);
    return hasil;
  }

  /// Hapus satu baris lokal + operasinya (+ foto_antre untuk eksekusi). Hasil: path file foto yang perlu dihapus.
  Future<List<String>> _hapusBaris(DatabaseExecutor tx, String userId, String jenis, String id) async {
    final file = <String>[];
    if (jenis == 'eksekusi') file.addAll(await _hapusFotoAntre(tx, id));
    await _outbox.hapusUntuk(tx, userId, id);
    await tx.delete(_tabel[jenis]!, where: 'id = ?', whereArgs: [id]);
    return file;
  }

  Future<List<String>> _hapusFotoAntre(DatabaseExecutor tx, String eksekusiId) async {
    final f = await tx.query('foto_antre', where: 'eksekusi_id = ?', whereArgs: [eksekusiId]);
    await tx.delete('foto_antre', where: 'eksekusi_id = ?', whereArgs: [eksekusiId]);
    return [
      for (final x in f)
        for (final k in const ['path', 'path_asli'])
          if (x[k] is String && (x[k] as String).isNotEmpty) x[k] as String,
    ];
  }

  Future<void> _hapusFile(List<String> path) async {
    for (final p in path) {
      try {
        final f = File(p);
        if (await f.exists()) await f.delete();
      } catch (_) {
        // file foto lokal tidak bisa dihapus: dibiarkan, tidak menggagalkan batal
      }
    }
  }

  /// Urungkan hanya dari akar pembatalan (induknya tidak sedang menunggu batal) dan selama batal belum terkirim.
  Future<bool> bisaUrungkan(String userId, String jenis, String id) async {
    final row = await _baris(_d, jenis, id);
    if (row == null || row['status'] != 'BATAL' || !await _batalTertunda(_d, userId, id)) return false;
    final kolom = _kolomInduk[jenis];
    if (kolom == null) return true;
    final indukJenis = jenis == 'eksekusi' ? 'realisasi' : 'header';
    final induk = await _baris(_d, indukJenis, row[kolom] as String);
    return induk == null || !(induk['status'] == 'BATAL' && await _batalTertunda(_d, userId, induk['id'] as String));
  }

  Future<bool> _batalTertunda(DatabaseExecutor ex, String userId, String id) async {
    final r = await ex.query('outbox',
        columns: ['op_id'], where: "user_id = ? AND id = ? AND aksi = 'batal' AND status = 'TERTUNDA'", whereArgs: [userId, id], limit: 1);
    return r.isNotEmpty;
  }

  /// Data yang dihapus (belum pernah terkirim) tidak ikut kembali.
  Future<int> urungkan(Sesi s, String jenis, String id) async {
    if (!await bisaUrungkan(s.userId, jenis, id)) throw RowError('Pembatalan sudah terkirim atau harus diurungkan dari induknya.');
    var n = 0;
    await _d.transaction((tx) async {
      for (final x in await _pohon(tx, jenis, id, status: 'BATAL')) {
        final nid = x.row['id'] as String;
        if (!await _batalTertunda(tx, s.userId, nid)) continue;
        await tx.delete('outbox',
            where: "user_id = ? AND id = ? AND aksi = 'batal' AND status = 'TERTUNDA'", whereArgs: [s.userId, nid]);
        final sisa = await _outbox.belumTerkirimUntuk(tx, s.userId, nid);
        await tx.update(_tabel[x.jenis]!, {'status': 'AKTIF', 'sinkron': sisa.isEmpty ? 'TERKIRIM' : 'LOKAL', 'alasan': null},
            where: 'id = ?', whereArgs: [nid]);
        n++;
      }
    });
    return n;
  }

  // ---------- G: daftar masalah ----------

  Future<List<MasalahSync>> daftarMasalah(String userId) async {
    final hasil = <MasalahSync>[];
    for (final op in await _outbox.perluTindakan(userId)) {
      final row = await _baris(_d, op['jenis'] as String, op['id'] as String);
      final kode = (row?['kode'] as String?) ?? (op['kode'] as String);
      hasil.add(MasalahSync(op, kode, tanggalDariKode(kode)));
    }
    return hasil;
  }

  /// Tanggal yang perlu ditarik ulang dari server sebelum Minta nomor baru / Gabungkan / konflik revisi.
  /// Hanya tanggal dalam 7 hari (lebih tua ditolak getKodeRow).
  Future<Set<String>> tanggalMasalah(String userId) async =>
      {for (final m in await daftarMasalah(userId)) if (m.tanggal != null && dalamBatas(m.kode)) m.tanggal!};

  // ---------- C: Minta nomor baru ----------

  /// Syarat: getKodeRow tanggal data sudah ditarik (baris server + kode_terpakai ada di HP).
  /// Hasil: daftar (kode lama, kode baru) per akar bentrok.
  Future<List<({String lama, String baru})>> mintaNomorBaru(Sesi s) async {
    _pastikanBoleh(s);
    final ganti = <({String lama, String baru})>[];
    await _d.transaction((tx) async {
      final akar = await tx.query('outbox',
          where: "user_id = ? AND aksi = 'buat' AND status = 'KONFLIK' AND (alasan IS NULL OR alasan = 'KODE_BENTROK')",
          whereArgs: [s.userId],
          orderBy: 'urutan ASC, waktu_perangkat ASC');
      for (final op in akar) {
        final jenis = op['jenis'] as String;
        final row = await _baris(tx, jenis, op['id'] as String);
        if (row == null) {
          await tx.delete('outbox', where: 'op_id = ?', whereArgs: [op['op_id']]);
          continue;
        }
        final lama = row['kode'] as String;
        final urut = await _urutBerikutnya(tx, s, jenis, row);
        if (urut > KodeRow.urutMaks) throw RowError('Nomor $lama sudah habis (999). Hubungi admin.');
        final baru = KodeRow.denganUrut(lama, urut);
        await _gantiKodeBerantai(tx, s.userId, jenis, row, lama, baru, pulihkan: const {'INDUK_BENTROK'});
        ganti.add((lama: lama, baru: baru));
      }
    });
    return ganti;
  }

  /// Nomor berikutnya = terbesar yang dikenal HP (baris sendiri + baris server dari getKodeRow, termasuk BATAL) + 1.
  Future<int> _urutBerikutnya(DatabaseExecutor tx, Sesi s, String jenis, Map<String, Object?> row) async {
    var maks = 0;
    void cek(String kode, int? Function(String) urut) {
      final u = urut(kode) ?? 0;
      if (u > maks) maks = u;
    }

    if (jenis == 'header') {
      final tanggal = row['tanggal'] as String;
      final kt = await tx.query('kode_terpakai', where: 'sub_tim = ? AND tanggal = ?', whereArgs: [s.timKode, tanggal]);
      if (kt.isNotEmpty) maks = (kt.first['urut_maks'] as int?) ?? 0;
      for (final h in await tx.query('row_header', columns: ['kode'], where: 'tanggal = ?', whereArgs: [tanggal])) {
        cek(h['kode'] as String, KodeRow.urutHeader);
      }
    } else {
      final kolom = _kolomInduk[jenis]!;
      for (final x in await tx.query(_tabel[jenis]!, columns: ['kode'], where: '$kolom = ?', whereArgs: [row[kolom]])) {
        cek(x['kode'] as String, KodeRow.urutAnak);
      }
    }
    return KodeRow.urutBerikutnya(maks);
  }

  /// Ganti kode data + semua turunannya (lewat relasi ID, bukan awalan kode: baris HP lain dengan kode lama yang
  /// sama ikut tersimpan dari getKodeRow dan tidak boleh tersentuh). Operasi akar + turunan dengan alasan di
  /// [pulihkan] kembali TERTUNDA.
  Future<void> _gantiKodeBerantai(DatabaseExecutor tx, String userId, String jenis, Map<String, Object?> row, String lama,
      String baru, {Set<String> pulihkan = const {}}) async {
    for (final n in await _pohon(tx, jenis, row['id'] as String)) {
      final nid = n.row['id'] as String;
      final kodeN = n.row['kode'] as String;
      final kodeBaru = nid == row['id'] ? baru : KodeRow.gantiInduk(kodeN, lama, baru);
      await tx.update(_tabel[n.jenis]!, {'kode': kodeBaru, 'sinkron': 'LOKAL', 'alasan': null}, where: 'id = ?', whereArgs: [nid]);
      for (final op in await _outbox.belumTerkirimUntuk(tx, userId, nid)) {
        final status = op['status'] as String;
        final alasan = op['alasan'] as String?;
        final akar = nid == row['id'];
        final balik = status != 'TERTUNDA' && (akar || pulihkan.contains(alasan));
        if (balik) {
          await _outbox.kembalikanTertunda(tx, op['op_id'] as String, kode: kodeBaru);
        } else {
          await tx.update('outbox', {'kode': kodeBaru}, where: 'op_id = ?', whereArgs: [op['op_id']]);
        }
      }
    }
  }

  // ---------- D: Gabungkan ke header / penyulang server ----------

  /// Header AKTIF dari server (HP lain) di tanggal yang sama. Syarat: getKodeRow tanggal itu sudah ditarik.
  Future<Map<String, Object?>?> headerServer(String userId, String headerLokalId) async {
    final hl = await _baris(_d, 'header', headerLokalId);
    if (hl == null) return null;
    final calon = await _d.query('row_header',
        where: "tanggal = ? AND status = 'AKTIF' AND id != ? AND sinkron = 'TERKIRIM'", whereArgs: [hl['tanggal'], headerLokalId]);
    for (final h in calon) {
      if (!await _outbox.belumDiterima(_d, userId, h['id'] as String)) return h;
    }
    return null;
  }

  /// HEADER_GANDA: semua penyulang + eksekusi header HP ini dipindah ke header server. [isiKosong] = kolom header
  /// server yang masih kosong (koordinat / KM / kendala) diisi dari HP ini lewat operasi ubah.
  Future<String> gabungKeHeaderServer(Sesi s, String headerLokalId, {bool isiKosong = true}) async {
    _pastikanBoleh(s);
    final hs = await headerServer(s.userId, headerLokalId);
    if (hs == null) throw RowError('Header dari HP lain belum ditemukan. Sambungkan internet lalu coba lagi.');
    final file = <String>[]; // v0.62.5: dihapus SESUDAH transaksi berhasil
    await _d.transaction((tx) async {
      final hl = await _baris(tx, 'header', headerLokalId);
      if (hl == null) return;
      if (!await _outbox.belumDiterima(tx, s.userId, headerLokalId)) throw RowError('Header ini sudah ada di server.');
      for (final rl in await tx.query('row_realisasi', where: 'header_id = ?', whereArgs: [headerLokalId])) {
        final rid = rl['id'] as String;
        if (rl['status'] != 'AKTIF') {
          file.addAll(await _hapusPohon(tx, s.userId, 'realisasi', rid));
          continue;
        }
        final rs = await _realisasiSama(tx, hs['id'] as String, rl['penyulang'] as String, kecuali: rid);
        if (rs != null) {
          await _pindahEksekusi(tx, s.userId, rl, rs);
          await _hapusBaris(tx, s.userId, 'realisasi', rid);
          continue;
        }
        final urut = await _urutBerikutnya(tx, s, 'realisasi', {'header_id': hs['id']});
        final lama = rl['kode'] as String;
        final baru = KodeRow.realisasi(hs['kode'] as String, urut);
        await tx.update('row_realisasi', {'header_id': hs['id']}, where: 'id = ?', whereArgs: [rid]);
        await _gantiKodeBerantai(tx, s.userId, 'realisasi', rl, lama, baru, pulihkan: const {'INDUK_GAGAL', 'INDUK_TIDAK_ADA'});
        await _gantiIsiBuat(tx, s.userId, rid, {'headerId': hs['id']}, indukId: hs['id'] as String);
      }
      if (isiKosong) await _isiHeaderKosong(tx, s.userId, hl, hs);
      await _hapusBaris(tx, s.userId, 'header', headerLokalId);
    });
    await _hapusFile(file);
    return hs['kode'] as String;
  }

  /// PENYULANG_GANDA: eksekusi penyulang HP ini dipindah ke penyulang yang sama dari HP lain.
  Future<String> gabungKePenyulangServer(Sesi s, String realisasiLokalId) async {
    _pastikanBoleh(s);
    late String kode;
    await _d.transaction((tx) async {
      final rl = await _baris(tx, 'realisasi', realisasiLokalId);
      if (rl == null) throw RowError('Penyulang tidak ditemukan.');
      final rs = await _realisasiSama(tx, rl['header_id'] as String, rl['penyulang'] as String, kecuali: realisasiLokalId);
      if (rs == null) throw RowError('Penyulang ${rl['penyulang']} dari HP lain belum ditemukan. Sambungkan internet lalu coba lagi.');
      await _pindahEksekusi(tx, s.userId, rl, rs);
      await _hapusBaris(tx, s.userId, 'realisasi', realisasiLokalId);
      kode = rs['kode'] as String;
    });
    return kode;
  }

  Future<Map<String, Object?>?> _realisasiSama(DatabaseExecutor tx, String headerId, String penyulang, {required String kecuali}) async {
    final r = await tx.query('row_realisasi',
        where: "header_id = ? AND status = 'AKTIF' AND lower(penyulang) = lower(?) AND id != ? AND sinkron = 'TERKIRIM'",
        whereArgs: [headerId, penyulang, kecuali],
        limit: 1);
    return r.isEmpty ? null : r.first;
  }

  Future<void> _pindahEksekusi(DatabaseExecutor tx, String userId, Map<String, Object?> rl, Map<String, Object?> rs) async {
    for (final e in await tx.query('row_eksekusi', where: 'realisasi_id = ?', whereArgs: [rl['id']], orderBy: 'kode ASC')) {
      final eid = e['id'] as String;
      if (e['status'] != 'AKTIF' || !await _outbox.belumDiterima(tx, userId, eid)) {
        await _hapusBaris(tx, userId, 'eksekusi', eid);
        continue;
      }
      final urut = await _urutBerikutnyaAnak(tx, 'row_eksekusi', 'realisasi_id', rs['id'] as String);
      final baru = KodeRow.eksekusi(rs['kode'] as String, urut);
      await tx.update('row_eksekusi', {'realisasi_id': rs['id'], 'kode': baru, 'sinkron': 'LOKAL', 'alasan': null},
          where: 'id = ?', whereArgs: [eid]);
      for (final op in await _outbox.belumTerkirimUntuk(tx, userId, eid)) {
        await tx.update('outbox', {'kode': baru, 'induk_id': rs['id']}, where: 'op_id = ?', whereArgs: [op['op_id']]);
      }
      await _gantiIsiBuat(tx, userId, eid, {'realisasiId': rs['id']}, indukId: rs['id'] as String);
    }
  }

  Future<int> _urutBerikutnyaAnak(DatabaseExecutor tx, String tabel, String kolom, String indukId) async {
    var maks = 0;
    for (final x in await tx.query(tabel, columns: ['kode'], where: '$kolom = ?', whereArgs: [indukId])) {
      final u = KodeRow.urutAnak(x['kode'] as String) ?? 0;
      if (u > maks) maks = u;
    }
    if (maks + 1 > KodeRow.urutMaks) throw RowError('Nomor eksekusi sudah habis (999).');
    return maks + 1;
  }

  /// Isi operasi buat diganti (induk baru) lalu kembali TERTUNDA.
  Future<void> _gantiIsiBuat(DatabaseExecutor tx, String userId, String id, Map<String, Object?> ubah, {String? indukId}) async {
    final r = await tx.query('outbox',
        where: "user_id = ? AND id = ? AND aksi = 'buat' AND status != 'TERKIRIM'", whereArgs: [userId, id], limit: 1);
    if (r.isEmpty) return;
    final isi = Map<String, dynamic>.from(jsonDecode(r.first['isi'] as String) as Map<String, dynamic>)..addAll(ubah);
    await _outbox.kembalikanTertunda(tx, r.first['op_id'] as String, isi: isi, indukId: indukId);
  }

  Future<void> _isiHeaderKosong(DatabaseExecutor tx, String userId, Map<String, Object?> hl, Map<String, Object?> hs) async {
    const kolom = {
      'koordinat_awal': 'koordinatAwal',
      'koordinat_akhir': 'koordinatAkhir',
      'km_awal': 'kmAwal',
      'km_akhir': 'kmAkhir',
      'kendala': 'kendala',
    };
    bool kosong(Object? v) => v == null || (v is String && v.trim().isEmpty);
    final lokal = <String, Object?>{}, kirim = <String, Object?>{};
    for (final e in kolom.entries) {
      if (kosong(hs[e.key]) && !kosong(hl[e.key])) {
        lokal[e.key] = hl[e.key];
        kirim[e.value] = hl[e.key];
      }
    }
    if (kirim.isEmpty) return;
    final hid = hs['id'] as String;
    await tx.update('row_header', {...lokal, 'sinkron': 'LOKAL', 'diubah_pada': _sekarang()}, where: 'id = ?', whereArgs: [hid]);
    final ubah = await _outbox.tertundaUntuk(tx, userId, hid, 'ubah');
    if (ubah != null) {
      final isi = Map<String, dynamic>.from(jsonDecode(ubah['isi'] as String) as Map<String, dynamic>)..addAll(kirim);
      await _outbox.gantiIsi(tx, ubah['op_id'] as String, isi);
      return;
    }
    await _outbox.tambah(
        ex: tx, userId: userId, jenis: 'header', aksi: 'ubah', id: hid, kode: hs['kode'] as String,
        revision: (hs['revision'] as int?) ?? 0, isi: kirim);
  }

  /// v0.62.5: TIDAK menghapus file. Dulu file foto dihapus di dalam transaksi; kalau langkah berikutnya gagal,
  /// baris DB kembali (rollback) tapi fotonya sudah hilang. Hasil = path untuk dihapus pemanggil setelah commit.
  Future<List<String>> _hapusPohon(DatabaseExecutor tx, String userId, String jenis, String id) async {
    final file = <String>[];
    for (final n in await _pohon(tx, jenis, id)) {
      file.addAll(await _hapusBaris(tx, userId, n.jenis, n.row['id'] as String));
    }
    return file;
  }

  // ---------- E + F: konflik revisi, buang, hapus ----------

  /// Kirim ulang punya saya: revision operasi = revision server (dari getKodeRow), kembali TERTUNDA.
  Future<void> kirimUlang(Sesi s, String opId, int revisionServer) async {
    _pastikanBoleh(s);
    await _d.transaction((tx) async {
      final op = await tx.query('outbox', where: 'op_id = ?', whereArgs: [opId], limit: 1);
      if (op.isEmpty) return;
      await _outbox.kembalikanTertunda(tx, opId, revision: revisionServer);
      await tx.update(_tabel[op.first['jenis']]!, {'sinkron': 'LOKAL', 'alasan': null}, where: 'id = ?', whereArgs: [op.first['id']]);
    });
  }

  /// Pakai data server / buang operasi ubah atau batal: operasi dibuang, baris ditandai TERKIRIM supaya
  /// getKodeRow berikutnya menimpanya dengan data server (pemanggil menarik ulang tanggal itu).
  /// Operasi buat = Hapus data + turunannya dari HP (belum pernah ada di server).
  Future<void> buang(Sesi s, String opId) async {
    final file = <String>[];
    await _d.transaction((tx) async {
      final r = await tx.query('outbox', where: 'op_id = ?', whereArgs: [opId], limit: 1);
      if (r.isEmpty) return;
      final op = r.first;
      final jenis = op['jenis'] as String, id = op['id'] as String;
      if (op['aksi'] == 'buat') {
        for (final n in await _pohon(tx, jenis, id)) {
          file.addAll(await _hapusBaris(tx, s.userId, n.jenis, n.row['id'] as String));
        }
        if (await _baris(tx, jenis, id) == null) await tx.delete('outbox', where: 'op_id = ?', whereArgs: [opId]);
        return;
      }
      await tx.delete('outbox', where: 'op_id = ?', whereArgs: [opId]);
      // v0.62.7 (audit 7 Okt 2026): "Pakai data server" / "Buang perubahan" juga membuang perubahan (ubah) lain yang
      // menunggu untuk data yang sama. Dulu hanya operasi yang dipilih, jadi baris tetap LOKAL, tidak ditimpa data
      // server, dan perubahan berikutnya bentrok lagi. Batal yang menunggu tidak disentuh (tindakan terpisah).
      await tx.delete('outbox',
          where: "user_id = ? AND id = ? AND aksi = 'ubah' AND status != 'TERKIRIM'", whereArgs: [s.userId, id]);
      final sisa = await _outbox.belumTerkirimUntuk(tx, s.userId, id);
      if (sisa.isEmpty) {
        await tx.update(_tabel[jenis]!, {'sinkron': 'TERKIRIM', 'alasan': null}, where: 'id = ?', whereArgs: [id]);
      }
    });
    await _hapusFile(file);
  }
}
