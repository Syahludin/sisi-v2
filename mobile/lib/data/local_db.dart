import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

/// Database lokal (offline first). Satu file: sisi_row.db
///
/// master_cache  : isi getMaster terakhir + versinya (PRD F-MASTER)
/// outbox        : operasi ROW yang belum diterima server (PRD F-ROW-SYNC)
/// foto_antre    : foto menunggu uploadFotoRow (PRD F-ROW-FOTO)
/// kode_terpakai : nomor urut Header terbesar per sub-tim per tanggal (PRD F-ROW-INPUT)
///
/// Setiap baris punya user_id: outbox milik user lain tidak pernah dikirim atas nama user aktif.
class LocalDb {
  LocalDb._(this.db);

  final Database db;
  static const int versiSkema = 1;

  static Future<LocalDb> buka() async {
    final dir = await getDatabasesPath();
    final db = await openDatabase(
      p.join(dir, 'sisi_row.db'),
      version: versiSkema,
      onCreate: (db, versi) async {
        final b = db.batch();
        b.execute('''
          CREATE TABLE master_cache (
            kunci TEXT PRIMARY KEY,
            versi TEXT NOT NULL,
            json TEXT NOT NULL,
            diambil_pada TEXT NOT NULL
          )''');
        b.execute('''
          CREATE TABLE outbox (
            op_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            jenis TEXT NOT NULL CHECK (jenis IN ('header','realisasi','eksekusi')),
            aksi TEXT NOT NULL CHECK (aksi IN ('buat','ubah','batal')),
            id TEXT NOT NULL,
            induk_id TEXT,
            kode TEXT NOT NULL,
            revision INTEGER NOT NULL DEFAULT 0,
            isi TEXT NOT NULL,
            waktu_perangkat TEXT NOT NULL,
            urutan INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'TERTUNDA',
            alasan TEXT,
            dikirim_pada TEXT
          )''');
        b.execute('CREATE INDEX outbox_status ON outbox (user_id, status, urutan)');
        b.execute('''
          CREATE TABLE foto_antre (
            foto_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            eksekusi_id TEXT NOT NULL,
            jenis_foto TEXT NOT NULL,
            path TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'TERTUNDA',
            dibuat_pada TEXT NOT NULL
          )''');
        b.execute('''
          CREATE TABLE kode_terpakai (
            sub_tim TEXT NOT NULL,
            tanggal TEXT NOT NULL,
            urut_maks INTEGER NOT NULL DEFAULT 0,
            dari_server INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (sub_tim, tanggal)
          )''');
        await b.commit(noResult: true);
      },
      // onUpgrade: tambah migrasi per versi di sini, JANGAN hapus tabel (data offline bisa hilang).
    );
    return LocalDb._(db);
  }
}
