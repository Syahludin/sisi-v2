import 'dart:convert';
import 'dart:io';

import 'package:sqflite/sqflite.dart';

import '../../core/sesi.dart';
import '../../core/wib.dart';
import '../../data/local_db.dart';
import 'jenis_pekerjaan.dart';
import 'kode_row.dart';
import 'row_model.dart';
import 'row_outbox.dart';

class RowError implements Exception {
  RowError(this.pesan);
  final String pesan;
  @override
  String toString() => pesan;
}

/// v0.62.8: kode rencana sudah dipakai saat transaksi simpan dimulai (pemanggil merender ulang foto lalu mencoba lagi).
class KodeRencanaDipakai implements Exception {
  const KodeRencanaDipakai();
}

/// Semua tulis data ROW di HP: baris lokal + operasi outbox dalam SATU transaksi (PRD F-ROW-INPUT, F-ROW-SYNC).
class RowRepository {
  RowRepository(this._db, this._outbox);

  final LocalDb _db;
  final RowOutbox _outbox;

  Database get _d => _db.db;
  String _sekarang() => DateTime.now().toUtc().toIso8601String();

  // ---------- baca ----------

  Future<List<RowHeader>> daftarHeader(String userId) async {
    final batas = Wib.tanggal(DateTime.now().subtract(const Duration(days: 7)));
    final r = await _d.query('row_header',
        where: 'user_id = ? AND tanggal >= ?', whereArgs: [userId, batas], orderBy: 'tanggal DESC, kode DESC');
    return r.map(RowHeader.new).toList();
  }

  Future<RowHeader?> header(String id) async {
    final r = await _d.query('row_header', where: 'id = ?', whereArgs: [id], limit: 1);
    return r.isEmpty ? null : RowHeader(r.first);
  }

  Future<RowHeader?> headerAktifPada(String userId, String tanggal) async {
    final r = await _d.query('row_header',
        where: 'user_id = ? AND tanggal = ? AND status = ?', whereArgs: [userId, tanggal, 'AKTIF'], limit: 1);
    return r.isEmpty ? null : RowHeader(r.first);
  }

  Future<List<RowRealisasi>> realisasiDari(String headerId) async {
    final r = await _d.query('row_realisasi', where: 'header_id = ?', whereArgs: [headerId], orderBy: 'kode ASC');
    return r.map(RowRealisasi.new).toList();
  }

  Future<RowRealisasi?> realisasi(String id) async {
    final r = await _d.query('row_realisasi', where: 'id = ?', whereArgs: [id], limit: 1);
    return r.isEmpty ? null : RowRealisasi(r.first);
  }

  Future<List<RowEksekusi>> eksekusiDari(String realisasiId) async {
    final r = await _d.query('row_eksekusi', where: 'realisasi_id = ?', whereArgs: [realisasiId], orderBy: 'kode ASC');
    return r.map(RowEksekusi.new).toList();
  }

  /// Jumlah eksekusi AKTIF per realisasi (untuk kartu).
  Future<Map<String, int>> jumlahEksekusi(String headerId) async {
    final r = await _d.rawQuery('''
      SELECT e.realisasi_id AS rid, COUNT(*) AS n FROM row_eksekusi e
      JOIN row_realisasi r ON r.id = e.realisasi_id
      WHERE r.header_id = ? AND e.status = 'AKTIF' GROUP BY e.realisasi_id''', [headerId]);
    return {for (final x in r) x['rid'] as String: (x['n'] as int?) ?? 0};
  }

  /// Jumlah eksekusi AKTIF yang fotonya BELUM lengkap per realisasi (untuk warna kartu penyulang).
  /// Lengkap = foto_lengkap dari server, atau 3 slot sudah ada di HP (menunggu terkirim).
  Future<Map<String, int>> belumLengkap(String headerId) async {
    final r = await _d.rawQuery('''
      SELECT e.realisasi_id AS rid, COUNT(*) AS n FROM row_eksekusi e
      JOIN row_realisasi r ON r.id = e.realisasi_id
      WHERE r.header_id = ? AND e.status = 'AKTIF' AND COALESCE(e.foto_lengkap, 0) = 0
        AND (SELECT COUNT(DISTINCT f.jenis_foto) FROM foto_antre f WHERE f.eksekusi_id = e.id) < 3
      GROUP BY e.realisasi_id''', [headerId]);
    return {for (final x in r) x['rid'] as String: (x['n'] as int?) ?? 0};
  }

  /// v1.0.17 (sinkron atomik): jumlah data laporan [headerId] yang belum diterima server: operasi outbox (header,
  /// penyulang, eksekusi) + foto eksekusi di antrean. Selama > 0, status SIAP WA dari server belum boleh dipakai
  /// (ringkasan server sudah berubah tetapi rincian / foto / WA belum lengkap).
  Future<int> jumlahTertundaHeader(String userId, String headerId) async {
    final r = await _d.rawQuery('''
      SELECT
        (SELECT COUNT(*) FROM outbox o WHERE o.user_id = ? AND o.status != 'TERKIRIM' AND (
            o.id = ?
            OR o.id IN (SELECT id FROM row_realisasi WHERE header_id = ?)
            OR o.id IN (SELECT e.id FROM row_eksekusi e JOIN row_realisasi r ON r.id = e.realisasi_id WHERE r.header_id = ?)))
        + (SELECT COUNT(*) FROM foto_antre f WHERE f.user_id = ? AND f.status != 'TERKIRIM' AND f.eksekusi_id IN
            (SELECT e.id FROM row_eksekusi e JOIN row_realisasi r ON r.id = e.realisasi_id WHERE r.header_id = ? AND e.status = 'AKTIF'))
        AS n''', [userId, headerId, headerId, headerId, userId, headerId]);
    return (r.first['n'] as int?) ?? 0;
  }

  /// Wajib true sebelum membuat data baru (PRD F-ROW-INPUT): kode hari itu sudah ditarik dari server.
  Future<bool> sudahTarikKode(String timKode, String tanggal) async {
    final r = await _d.query('kode_terpakai',
        where: 'sub_tim = ? AND tanggal = ? AND dari_server = 1', whereArgs: [timKode, tanggal], limit: 1);
    return r.isNotEmpty;
  }

  // ---------- tulis ----------

  void _pastikanBolehInput(Sesi s) {
    if (!s.bisaUbah('ROW_EKSEKUSI')) throw RowError('Akun ini tidak punya akses input ROW.');
    if (!s.bolehInput(DateTime.now())) throw RowError('Batas offline lewat. Sambungkan internet dulu.');
  }

  Future<RowHeader> buatHeader(
    Sesi s, {
    String? koordinatAwal,
    String? koordinatAkhir,
    num? kmAwal,
    num? kmAkhir,
    String? kendala,
  }) async {
    _pastikanBolehInput(s);
    final tanggal = Wib.tanggal(DateTime.now());
    if (!await sudahTarikKode(s.timKode, tanggal)) {
      throw RowError('Kode hari ini belum ditarik dari server. Sambungkan internet lalu tarik ulang.');
    }
    if (await headerAktifPada(s.userId, tanggal) != null) {
      throw RowError('Header hari ini sudah ada. Satu sub-tim hanya satu header per hari.');
    }
    final id = RowOutbox.uuidBaru();
    late String kode;
    await _d.transaction((tx) async {
      final kt = await tx.query('kode_terpakai', where: 'sub_tim = ? AND tanggal = ?', whereArgs: [s.timKode, tanggal]);
      var maks = kt.isEmpty ? 0 : (kt.first['urut_maks'] as int? ?? 0);
      final lokal = await tx.query('row_header', columns: ['kode'], where: 'user_id = ? AND tanggal = ?', whereArgs: [s.userId, tanggal]);
      for (final r in lokal) {
        final u = KodeRow.urutHeader(r['kode'] as String) ?? 0;
        if (u > maks) maks = u;
      }
      kode = KodeRow.header(kodeSubTim: s.timKode, waktu: DateTime.now(), urut: KodeRow.urutBerikutnya(maks));
      await tx.insert('row_header', {
        'id': id,
        'user_id': s.userId,
        'kode': kode,
        'tanggal': tanggal,
        'koordinat_awal': koordinatAwal,
        'koordinat_akhir': koordinatAkhir,
        'km_awal': kmAwal,
        'km_akhir': kmAkhir,
        'kendala': kendala,
        'diubah_pada': _sekarang(),
      });
      await _outbox.tambah(ex: tx, userId: s.userId, jenis: 'header', aksi: 'buat', id: id, kode: kode, isi: {
        'tanggal': tanggal,
        if (koordinatAwal != null) 'koordinatAwal': koordinatAwal,
        if (koordinatAkhir != null) 'koordinatAkhir': koordinatAkhir,
        if (kmAwal != null) 'kmAwal': kmAwal,
        if (kmAkhir != null) 'kmAkhir': kmAkhir,
        if (kendala != null) 'kendala': kendala,
      });
    });
    return (await header(id))!;
  }

  /// `perubahan`: kunci koordinatAwal/koordinatAkhir/kmAwal/kmAkhir/kendala; nilai null = dikosongkan.
  /// Belum terkirim: digabung ke operasi buat/ubah yang masih antre (tidak menambah operasi baru).
  Future<void> ubahHeader(Sesi s, RowHeader h, Map<String, Object?> perubahan) async {
    _pastikanBolehInput(s);
    if (!h.aktif) throw RowError('Header sudah BATAL.');
    if (perubahan.isEmpty) return;
    const kolom = {
      'koordinatAwal': 'koordinat_awal',
      'koordinatAkhir': 'koordinat_akhir',
      'kmAwal': 'km_awal',
      'kmAkhir': 'km_akhir',
      'kendala': 'kendala',
    };
    await _d.transaction((tx) async {
      await tx.update(
        'row_header',
        {for (final e in perubahan.entries) kolom[e.key]!: e.value, 'diubah_pada': _sekarang(), 'sinkron': 'LOKAL'},
        where: 'id = ?',
        whereArgs: [h.id],
      );
      // v0.62 (M4): operasi yang DITOLAK validasi server ikut digabung lalu kembali ke antrean (Perbaiki).
      final buat = await _outbox.tertundaUntuk(tx, s.userId, h.id, 'buat', jugaDitolak: true);
      if (buat != null) {
        final isi = _isi(buat)..addAll(perubahan)..removeWhere((k, v) => v == null);
        await _gantiAtauKembalikan(tx, buat, isi);
        return;
      }
      final ubah = await _outbox.tertundaUntuk(tx, s.userId, h.id, 'ubah', jugaDitolak: true);
      if (ubah != null) {
        await _gantiAtauKembalikan(tx, ubah, _isi(ubah)..addAll(perubahan));
        return;
      }
      await _outbox.tambah(
          ex: tx, userId: s.userId, jenis: 'header', aksi: 'ubah', id: h.id, kode: h.kode, revision: h.revision, isi: perubahan);
    });
  }

  Future<RowRealisasi> buatRealisasi(Sesi s, RowHeader h, String penyulang) async {
    _pastikanBolehInput(s);
    if (!h.aktif) throw RowError('Header sudah BATAL.');
    final ada = await realisasiDari(h.id);
    if (ada.any((r) => r.aktif && r.penyulang.toLowerCase() == penyulang.toLowerCase())) {
      throw RowError('Penyulang $penyulang sudah ada di laporan ini.');
    }
    final maks = ada.fold<int>(0, (m, r) => (KodeRow.urutAnak(r.kode) ?? 0) > m ? KodeRow.urutAnak(r.kode)! : m);
    final id = RowOutbox.uuidBaru();
    final kode = KodeRow.realisasi(h.kode, KodeRow.urutBerikutnya(maks));
    await _d.transaction((tx) async {
      await tx.insert('row_realisasi', {
        'id': id,
        'user_id': s.userId,
        'header_id': h.id,
        'kode': kode,
        'penyulang': penyulang,
        'diubah_pada': _sekarang(),
      });
      await _outbox.tambah(
          ex: tx, userId: s.userId, jenis: 'realisasi', aksi: 'buat', id: id, indukId: h.id, kode: kode,
          isi: {'headerId': h.id, 'penyulang': penyulang});
    });
    return (await realisasi(id))!;
  }

  /// v0.62.8: id + kode eksekusi baru yang AKAN dipakai, supaya foto bisa dirender (watermark memuat kode) sebelum
  /// eksekusi disimpan. Kode dicek ulang di dalam transaksi [buatEksekusi].
  Future<({String id, String kode})> rencanaEksekusi(RowRealisasi r) async {
    final ada = await eksekusiDari(r.id);
    final maks = ada.fold<int>(0, (m, e) => (KodeRow.urutAnak(e.kode) ?? 0) > m ? KodeRow.urutAnak(e.kode)! : m);
    return (id: RowOutbox.uuidBaru(), kode: KodeRow.eksekusi(r.kode, KodeRow.urutBerikutnya(maks)));
  }

  /// Hasil: id eksekusi baru.
  /// v0.62.8: [rencana] (dari [rencanaEksekusi]) + [dalamTransaksi] = foto dicatat di transaksi yang SAMA dengan
  /// eksekusi + outbox. App mati / gagal sebelum commit = tidak ada yang tersimpan (belum disimpan = belum fix).
  Future<String> buatEksekusi(
    Sesi s,
    RowRealisasi r, {
    required String sectionId,
    required String sectionNama,
    String? nomorTiang,
    String? koordinatTiang,
    required String koordinatPekerjaan,
    required int diameter,
    required JenisPekerjaan jenis,
    ({String id, String kode})? rencana,
    Future<void> Function(DatabaseExecutor tx, String id, String kode)? dalamTransaksi,
  }) async {
    _pastikanBolehInput(s);
    if (!r.aktif) throw RowError('Penyulang ini sudah BATAL.');
    final awal = rencana ?? await rencanaEksekusi(r);
    final id = awal.id;
    var kode = awal.kode;
    await _d.transaction((tx) async {
      // v0.62.8: kode rencana sudah dipakai (mis. tarikKode / sync di antara render foto dan simpan). Dengan foto
      // (dalamTransaksi) = batal, pemanggil merender ulang foto dengan kode baru (watermark memuat kode). Tanpa foto =
      // langsung nomor berikutnya.
      final dipakai = await tx.query('row_eksekusi', columns: ['kode'], where: 'realisasi_id = ?', whereArgs: [r.id]);
      if (dipakai.any((x) => x['kode'] == kode)) {
        if (dalamTransaksi != null) throw const KodeRencanaDipakai();
        final maks = dipakai.fold<int>(0, (m, x) {
          final u = KodeRow.urutAnak(x['kode'] as String) ?? 0;
          return u > m ? u : m;
        });
        kode = KodeRow.eksekusi(r.kode, KodeRow.urutBerikutnya(maks));
      }
      await tx.insert('row_eksekusi', {
        'id': id,
        'user_id': s.userId,
        'realisasi_id': r.id,
        'kode': kode,
        'section_id': sectionId,
        'section': sectionNama,
        'nomor_tiang': nomorTiang ?? '',
        'koordinat_tiang': koordinatTiang,
        'koordinat_pekerjaan': koordinatPekerjaan,
        'diameter': diameter,
        'jenis_id': jenis.id,
        'jenis_nama': jenis.nama,
        'diubah_pada': _sekarang(),
      });
      await _outbox.tambah(ex: tx, userId: s.userId, jenis: 'eksekusi', aksi: 'buat', id: id, indukId: r.id, kode: kode, isi: {
        'realisasiId': r.id,
        'sectionId': sectionId,
        if (nomorTiang != null) 'nomorTiang': nomorTiang,
        if (koordinatTiang != null) 'koordinatTiang': koordinatTiang,
        'koordinatPekerjaan': koordinatPekerjaan,
        'diameter': diameter,
        'jenisId': jenis.id,
        'sumber': 'LANGSUNG',
      });
      if (dalamTransaksi != null) await dalamTransaksi(tx, id, kode);
    });
    return id;
  }

  /// Edit data eksekusi (tombol Edit di detail). Hanya field yang berubah yang dikirim.
  /// Diameter + jenis selalu dikirim berpasangan (aturan server). Nomor tiang & koordinat tiang boleh dihapus
  /// (null); koordinat pekerjaan wajib. Belum terkirim = digabung ke operasi buat/ubah yang masih antre.
  /// Hasil: false kalau tidak ada yang berubah.
  Future<bool> ubahEksekusi(
    Sesi s,
    RowEksekusi e, {
    required String sectionId,
    required String sectionNama,
    String? nomorTiang,
    String? koordinatTiang,
    required String koordinatPekerjaan,
    required int diameter,
    required JenisPekerjaan jenis,
  }) async {
    _pastikanBolehInput(s);
    if (!e.aktif) throw RowError('Eksekusi sudah BATAL.');
    final perubahan = <String, Object?>{};
    final lokal = <String, Object?>{};
    if (sectionId != e.sectionId) {
      perubahan['sectionId'] = sectionId;
      lokal['section_id'] = sectionId;
      lokal['section'] = sectionNama;
    }
    if ((nomorTiang ?? '') != (e.nomorTiang ?? '')) {
      perubahan['nomorTiang'] = nomorTiang;
      lokal['nomor_tiang'] = nomorTiang ?? '';
    }
    if ((koordinatTiang ?? '') != (e.koordinatTiang ?? '')) {
      perubahan['koordinatTiang'] = koordinatTiang;
      lokal['koordinat_tiang'] = koordinatTiang;
    }
    if (koordinatPekerjaan != (e.koordinatPekerjaan ?? '')) {
      perubahan['koordinatPekerjaan'] = koordinatPekerjaan;
      lokal['koordinat_pekerjaan'] = koordinatPekerjaan;
    }
    if (diameter != e.diameter || jenis.id != e.jenisId) {
      perubahan['diameter'] = diameter;
      perubahan['jenisId'] = jenis.id;
      lokal['diameter'] = diameter;
      lokal['jenis_id'] = jenis.id;
      lokal['jenis_nama'] = jenis.nama;
    }
    if (perubahan.isEmpty) return false;
    await _d.transaction((tx) async {
      await tx.update('row_eksekusi', {...lokal, 'diubah_pada': _sekarang(), 'sinkron': 'LOKAL'},
          where: 'id = ?', whereArgs: [e.id]);
      // v0.62 (M4): operasi yang DITOLAK validasi server ikut digabung lalu kembali ke antrean (Perbaiki).
      final buat = await _outbox.tertundaUntuk(tx, s.userId, e.id, 'buat', jugaDitolak: true);
      if (buat != null) {
        final isi = _isi(buat)..addAll(perubahan)..removeWhere((k, v) => v == null);
        await _gantiAtauKembalikan(tx, buat, isi);
        return;
      }
      final ubah = await _outbox.tertundaUntuk(tx, s.userId, e.id, 'ubah', jugaDitolak: true);
      if (ubah != null) {
        await _gantiAtauKembalikan(tx, ubah, _isi(ubah)..addAll(perubahan));
        return;
      }
      await _outbox.tambah(
          ex: tx, userId: s.userId, jenis: 'eksekusi', aksi: 'ubah', id: e.id, indukId: e.realisasiId, kode: e.kode,
          revision: e.revision, isi: perubahan);
    });
    return true;
  }

  /// v0.90.0: jumlah eksekusi AKTIF per penyulang (realisasi) > section > jenis, untuk ringkasan detail ROW.
  Future<List<({String realisasiId, String section, String jenisId, int n})>> rincianJenis(String headerId) async {
    final r = await _d.rawQuery('''
      SELECT e.realisasi_id AS rid, COALESCE(e.section, '-') AS s, COALESCE(e.jenis_id, '') AS j, COUNT(*) AS n
      FROM row_eksekusi e JOIN row_realisasi r ON r.id = e.realisasi_id
      WHERE r.header_id = ? AND r.status = 'AKTIF' AND e.status = 'AKTIF'
      GROUP BY e.realisasi_id, e.section, e.jenis_id ORDER BY e.section''', [headerId]);
    return [
      for (final x in r)
        (realisasiId: x['rid'] as String, section: (x['s'] as String?) ?? '-', jenisId: (x['j'] as String?) ?? '', n: (x['n'] as int?) ?? 0),
    ];
  }

  /// Jumlah eksekusi AKTIF per jenis_id dalam satu header (penyulang AKTIF saja).
  Future<Map<String, int>> hitungJenis(String headerId) async {
    final r = await _d.rawQuery('''
      SELECT e.jenis_id AS j, COUNT(*) AS n FROM row_eksekusi e
      JOIN row_realisasi r ON r.id = e.realisasi_id
      WHERE r.header_id = ? AND r.status = 'AKTIF' AND e.status = 'AKTIF' GROUP BY e.jenis_id''', [headerId]);
    return {for (final x in r) (x['j'] as String?) ?? '': (x['n'] as int?) ?? 0};
  }

  Future<RowEksekusi?> eksekusi(String id) async {
    final r = await _d.query('row_eksekusi', where: 'id = ?', whereArgs: [id], limit: 1);
    return r.isEmpty ? null : RowEksekusi(r.first);
  }

  // ---------- dari server ----------

  /// Hasil syncRow per operasi -> salinan lokal.
  Future<void> terapkanHasil(String jenis, String id, String status,
      {String? kode, int? revision, String? alasan, String? aksi}) async {
    // v0.62 (M4): batal eksekusi diterima server = foto lokal eksekusi itu tidak dipakai lagi (tidak ada Urungkan).
    if (aksi == 'batal' && jenis == 'eksekusi' && (status == 'OK' || status == 'DUPLIKAT')) {
      final f = await _d.query('foto_antre', where: 'eksekusi_id = ?', whereArgs: [id]);
      await _d.delete('foto_antre', where: 'eksekusi_id = ?', whereArgs: [id]);
      for (final x in f) {
        for (final k in const ['path', 'path_asli']) {
          final p = x[k];
          if (p is! String || p.isEmpty) continue;
          try {
            final file = File(p);
            if (await file.exists()) await file.delete();
          } catch (_) {
            // dibiarkan
          }
        }
      }
    }
    final tabel = 'row_$jenis';
    final sinkron = switch (status) {
      'OK' || 'DUPLIKAT' => 'TERKIRIM',
      'KODE_BENTROK' || 'KONFLIK_REVISION' => 'KONFLIK',
      _ => 'DITOLAK',
    };
    await _d.update(
      tabel,
      {
        'sinkron': sinkron,
        'alasan': sinkron == 'TERKIRIM' ? null : (alasan ?? status),
        if (revision != null && sinkron == 'TERKIRIM') 'revision': revision,
        if (kode != null && sinkron == 'TERKIRIM') 'kode': kode,
      },
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  /// Isi salinan lokal dari getKodeRow (setelah login / reinstall / KODE_BENTROK).
  /// Baris yang masih LOKAL (perubahan belum terkirim) tidak ditimpa isinya.
  /// v0.62.5: sync menandai operasi TERKIRIM lalu baru memperbarui baris (2 langkah). App mati di antaranya = baris
  /// tetap LOKAL selamanya karena operasinya tidak dikirim lagi. Baris LOKAL tanpa operasi terbuka tapi punya operasi
  /// TERKIRIM = sudah diterima server; boleh ditimpa data server seperti baris TERKIRIM.
  Future<bool> _diterimaTapiBasi(DatabaseExecutor tx, String userId, String id) async {
    final r = await tx.rawQuery(
        "SELECT SUM(CASE WHEN status = 'TERKIRIM' THEN 1 ELSE 0 END) AS kirim, SUM(CASE WHEN status != 'TERKIRIM' THEN 1 ELSE 0 END) AS buka "
        'FROM outbox WHERE user_id = ? AND id = ?',
        [userId, id]);
    final kirim = (r.first['kirim'] as int?) ?? 0, buka = (r.first['buka'] as int?) ?? 0;
    return kirim > 0 && buka == 0;
  }

  Future<void> simpanDariServer(Sesi s, Map<String, dynamic> d) async {
    final tanggal = d['tanggal'] as String;
    final now = _sekarang();
    await _d.transaction((tx) async {
      await tx.insert(
        'kode_terpakai',
        {'sub_tim': s.timKode, 'tanggal': tanggal, 'urut_maks': ((d['headerBerikutnya'] as num?) ?? 1).toInt() - 1, 'dari_server': 1},
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
      Future<void> upsert(String tabel, String id, Map<String, Object?> isiBaru, Map<String, Object?> isiUpdate) async {
        final ada = await tx.query(tabel, columns: ['sinkron'], where: 'id = ?', whereArgs: [id], limit: 1);
        if (ada.isEmpty) {
          await tx.insert(tabel, {...isiBaru, ...isiUpdate, 'user_id': s.userId, 'sinkron': 'TERKIRIM', 'diubah_pada': now});
        } else if (ada.first['sinkron'] == 'TERKIRIM' || (ada.first['sinkron'] == 'LOKAL' && await _diterimaTapiBasi(tx, s.userId, id))) {
          // v0.62 (M4): baris KONFLIK / DITOLAK tidak ditimpa diam-diam; diselesaikan di Pusat Masalah.
          await tx.update(tabel, {...isiUpdate, 'sinkron': 'TERKIRIM', 'alasan': null}, where: 'id = ?', whereArgs: [id]);
        }
      }

      for (final h in (d['header'] as List<dynamic>? ?? const <dynamic>[]).whereType<Map<dynamic, dynamic>>()) {
        await upsert('row_header', h['id'] as String, {'id': h['id'], 'kode': h['kode'], 'tanggal': tanggal}, {
          'status': h['status'],
          'revision': h['revision'],
          // isi tampilan (server v0.32+). Server lama tidak mengirim kunci ini: nilai lokal dibiarkan.
          if (h.containsKey('koordinatAwal')) ...{
            'koordinat_awal': h['koordinatAwal'],
            'koordinat_akhir': h['koordinatAkhir'],
            'km_awal': (h['kmAwal'] as num?)?.toDouble(),
            'km_akhir': (h['kmAkhir'] as num?)?.toDouble(),
            'kendala': h['kendala'],
          },
        });
      }
      for (final r in (d['realisasi'] as List<dynamic>? ?? const <dynamic>[]).whereType<Map<dynamic, dynamic>>()) {
        await upsert('row_realisasi', r['id'] as String,
            {'id': r['id'], 'header_id': r['headerId'], 'kode': r['kode'], 'penyulang': r['penyulang']},
            {'status': r['status'], 'revision': r['revision']});
      }
      for (final e in (d['eksekusi'] as List<dynamic>? ?? const <dynamic>[]).whereType<Map<dynamic, dynamic>>()) {
        await upsert('row_eksekusi', e['id'] as String, {
          'id': e['id'],
          'realisasi_id': e['realisasiId'],
          'kode': e['kode'],
          'section_id': e['sectionId'],
          'nomor_tiang': e['nomorTiang'] ?? '',
        }, {
          'jenis_id': e['jenisId'],
          'diameter': (e['diameter'] as num?)?.toInt(),
          'status': e['status'],
          'revision': e['revision'],
          'foto_lengkap': e['fotoLengkap'] == true ? 1 : 0,
          // isi tampilan (server v0.32+): memperbaiki Jenis/Section "-" setelah login ulang / reinstall
          if (e.containsKey('section')) ...{
            'section': e['section'],
            'jenis_nama': e['jenisNama'],
            'nomor_tiang': e['nomorTiang'] ?? '',
            'koordinat_tiang': e['koordinatTiang'],
            'koordinat_pekerjaan': e['koordinatPekerjaan'],
          },
        });
      }
    });
  }

  Future<void> _gantiAtauKembalikan(DatabaseExecutor tx, Map<String, Object?> op, Map<String, dynamic> isi) async {
    if (op['status'] == 'DITOLAK') {
      await _outbox.kembalikanTertunda(tx, op['op_id'] as String, isi: isi);
    } else {
      await _outbox.gantiIsi(tx, op['op_id'] as String, isi);
    }
  }

  Map<String, dynamic> _isi(Map<String, Object?> op) =>
      Map<String, dynamic>.from(jsonDecode(op['isi'] as String) as Map<String, dynamic>);
}
