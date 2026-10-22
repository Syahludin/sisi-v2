import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

/// Database lokal (offline first). Satu file: sisi_row.db
///
/// master_cache  : isi getMaster terakhir + versinya (PRD F-MASTER)
/// outbox        : operasi ROW yang belum diterima server (PRD F-ROW-SYNC)
/// foto_antre    : foto eksekusi (file di folder app) + status upload TERTUNDA | TERKIRIM | GAGAL (PRD F-ROW-FOTO).
///                 Foto kamera: path = sudah watermark, path_asli = tanpa watermark (v5)
/// arsip_row     : salinan arsip laporan (getArsipRow) yang diunduh petugas, untuk dilihat offline (v4)
/// arsip_yandal  : salinan arsip shift + P0 akun YANDAL (getArsipYandal), dilihat offline (v8)
/// hartek_lokal  : laporan Hartek harian tim di HP (json = bentuk getHartekHarian + tanda _sinkron per data) (v10)
/// hartek_antre  : antrean kirim Hartek FIFO (aksi + data), status MENUNGGU | GAGAL (v10)
/// wo_lokal, wo_antre : WO tindak lanjut tim di HP (cache getWoTim + pekerjaan / foto / mulai / selesai offline) dan
///                 antreannya, bentuk sama dengan hartek_lokal / hartek_antre (v11)
/// yan_p0        : Penugasan P0 shift berjalan yang dibuat di HP (json = P0Lokal, foto di folder foto_p0) (v9)
/// kode_terpakai : nomor urut Header terbesar per sub-tim per tanggal, dari getKodeRow (PRD F-ROW-INPUT)
/// row_header, row_realisasi, row_eksekusi : salinan data tim sendiri (7 hari). Layar SELALU membaca dari sini.
///
/// Setiap baris punya user_id: data milik user lain tidak pernah dikirim atas nama user aktif.
class LocalDb {
  LocalDb._(this.db);

  final Database db;
  static const int versiSkema = 11;

  static Future<LocalDb> buka() async {
    final dir = await getDatabasesPath();
    final db = await openDatabase(
      p.join(dir, 'sisi_row.db'),
      version: versiSkema,
      onCreate: (db, versi) async {
        final b = db.batch();
        _skemaV1(b);
        _skemaV2(b);
        _skemaV3(b);
        _skemaV4(b);
        _skemaV5(b);
        _skemaV6(b);
        _skemaV7(b);
        _skemaV8(b);
        _skemaV9(b);
        _skemaV10(b);
        _skemaV11(b);
        await b.commit(noResult: true);
      },
      // Migrasi: hanya MENAMBAH. Jangan hapus tabel (data offline bisa hilang).
      onUpgrade: (db, lama, baru) async {
        final b = db.batch();
        if (lama < 2) _skemaV2(b);
        if (lama < 3) _skemaV3(b);
        if (lama < 4) _skemaV4(b);
        if (lama < 5) _skemaV5(b);
        if (lama < 6) _skemaV6(b);
        if (lama < 7) _skemaV7(b);
        if (lama < 8) _skemaV8(b);
        if (lama < 9) _skemaV9(b);
        if (lama < 10) _skemaV10(b);
        if (lama < 11) _skemaV11(b);
        await b.commit(noResult: true);
      },
    );
    return LocalDb._(db);
  }

  static void _skemaV1(Batch b) {
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
  }

  /// v2 (M1, 3 Okt 2026): salinan lokal data ROW. `sinkron` = LOKAL | TERKIRIM | KONFLIK | DITOLAK.
  static void _skemaV2(Batch b) {
    b.execute('''
      CREATE TABLE row_header (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        kode TEXT NOT NULL,
        tanggal TEXT NOT NULL,
        koordinat_awal TEXT,
        koordinat_akhir TEXT,
        km_awal REAL,
        km_akhir REAL,
        kendala TEXT,
        status TEXT NOT NULL DEFAULT 'AKTIF',
        revision INTEGER NOT NULL DEFAULT 0,
        sinkron TEXT NOT NULL DEFAULT 'LOKAL',
        alasan TEXT,
        diubah_pada TEXT NOT NULL
      )''');
    b.execute('''
      CREATE TABLE row_realisasi (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        header_id TEXT NOT NULL,
        kode TEXT NOT NULL,
        penyulang TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'AKTIF',
        revision INTEGER NOT NULL DEFAULT 0,
        sinkron TEXT NOT NULL DEFAULT 'LOKAL',
        alasan TEXT,
        diubah_pada TEXT NOT NULL
      )''');
    b.execute('''
      CREATE TABLE row_eksekusi (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        realisasi_id TEXT NOT NULL,
        kode TEXT NOT NULL,
        section_id TEXT NOT NULL,
        section TEXT,
        nomor_tiang TEXT NOT NULL,
        koordinat_tiang TEXT,
        koordinat_pekerjaan TEXT,
        diameter INTEGER,
        jenis_id TEXT,
        jenis_nama TEXT,
        foto_lengkap INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'AKTIF',
        revision INTEGER NOT NULL DEFAULT 0,
        sinkron TEXT NOT NULL DEFAULT 'LOKAL',
        alasan TEXT,
        diubah_pada TEXT NOT NULL
      )''');
    b.execute('CREATE INDEX row_header_tgl ON row_header (user_id, tanggal)');
    b.execute('CREATE INDEX row_realisasi_h ON row_realisasi (header_id)');
    b.execute('CREATE INDEX row_eksekusi_r ON row_eksekusi (realisasi_id)');
  }

  /// v3 (3 Okt 2026): metadata foto untuk uploadFotoRow + cache teks WA per header.
  static void _skemaV3(Batch b) {
    for (final k in const [
      'sumber TEXT',
      'sha256 TEXT',
      'ukuran INTEGER',
      'diambil_pada TEXT',
      'alasan TEXT',
      'dikirim_pada TEXT',
    ]) {
      b.execute('ALTER TABLE foto_antre ADD COLUMN $k');
    }
    b.execute('CREATE INDEX foto_antre_eks ON foto_antre (eksekusi_id, jenis_foto)');
    b.execute('ALTER TABLE row_header ADD COLUMN wa_text TEXT');
    b.execute('ALTER TABLE row_header ADD COLUMN wa_siap INTEGER NOT NULL DEFAULT 0');
  }

  /// v4 (v0.23): arsip laporan yang diunduh dari tab Arsip. json = satu objek laporan getArsipRow apa adanya.
  static void _skemaV4(Batch b) {
    b.execute('''
      CREATE TABLE arsip_row (
        header_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        tanggal TEXT NOT NULL,
        kode TEXT NOT NULL,
        json TEXT NOT NULL,
        diunduh_pada TEXT NOT NULL
      )''');
    b.execute('CREATE INDEX arsip_row_tgl ON arsip_row (user_id, tanggal)');
  }

  /// v5 (v0.28): watermark foto kamera. path_asli = foto tanpa watermark (untuk render ulang kalau data berubah),
  /// wm_tanda = isi watermark yang sudah dibakar ke file `path`.
  static void _skemaV5(Batch b) {
    b.execute('ALTER TABLE foto_antre ADD COLUMN path_asli TEXT');
    b.execute('ALTER TABLE foto_antre ADD COLUMN wm_tanda TEXT');
  }

  /// v11 (v1.0.16): WO tindak lanjut offline. Struktur sama dengan hartek_lokal / hartek_antre (GudangHartekSql).
  static void _skemaV11(Batch b) {
    b.execute('''
      CREATE TABLE wo_lokal (
        user_id TEXT NOT NULL,
        tanggal TEXT NOT NULL,
        json TEXT NOT NULL,
        diubah_pada TEXT NOT NULL,
        PRIMARY KEY (user_id, tanggal)
      )''');
    b.execute('''
      CREATE TABLE wo_antre (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        tanggal TEXT NOT NULL,
        aksi TEXT NOT NULL,
        target TEXT NOT NULL,
        data TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'MENUNGGU',
        galat TEXT,
        dibuat_pada TEXT NOT NULL
      )''');
    b.execute('CREATE INDEX wo_antre_user ON wo_antre (user_id, status, id)');
  }

  /// v10 (v0.95.0): Hartek lokal + kirim otomatis. Layar membaca hartek_lokal, simpan = tulis lokal + antre.
  static void _skemaV10(Batch b) {
    b.execute('''
      CREATE TABLE hartek_lokal (
        user_id TEXT NOT NULL,
        tanggal TEXT NOT NULL,
        json TEXT NOT NULL,
        diubah_pada TEXT NOT NULL,
        PRIMARY KEY (user_id, tanggal)
      )''');
    b.execute('''
      CREATE TABLE hartek_antre (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        tanggal TEXT NOT NULL,
        aksi TEXT NOT NULL,
        target TEXT NOT NULL,
        data TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'MENUNGGU',
        galat TEXT,
        dibuat_pada TEXT NOT NULL
      )''');
    b.execute('CREATE INDEX hartek_antre_user ON hartek_antre (user_id, status, id)');
  }

  /// v9 (v0.64.0): P0 Yandal yang dibuat di HP. sinkron = LOKAL (kirim ke server menyusul) | TERKIRIM.
  static void _skemaV9(Batch b) {
    b.execute('''
      CREATE TABLE yan_p0 (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        shift_id TEXT NOT NULL,
        no INTEGER NOT NULL,
        status TEXT NOT NULL,
        sinkron TEXT NOT NULL DEFAULT 'LOKAL',
        json TEXT NOT NULL,
        dibuat_pada TEXT NOT NULL,
        diubah_pada TEXT NOT NULL
      )''');
    b.execute('CREATE INDEX yan_p0_shift ON yan_p0 (user_id, shift_id, no)');
  }

  /// v8 (v0.63.5): arsip shift Yandal. json = satu objek shift getArsipYandal (rekap + daftar P0) apa adanya.
  static void _skemaV8(Batch b) {
    b.execute('''
      CREATE TABLE arsip_yandal (
        shift_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        tanggal TEXT NOT NULL,
        shift INTEGER NOT NULL,
        json TEXT NOT NULL,
        diunduh_pada TEXT NOT NULL
      )''');
    b.execute('CREATE INDEX arsip_yandal_tgl ON arsip_yandal (user_id, tanggal)');
  }

  /// v7 (v0.50): arsip per tim untuk menu Operasi > Laporan per Tim (admin mengunduh arsip beberapa tim).
  /// Baris lama (PETUGAS, tim sendiri) tim_id NULL.
  static void _skemaV7(Batch b) {
    b.execute('ALTER TABLE arsip_row ADD COLUMN tim_id TEXT');
  }

  /// v6 (v0.29): posisi GPS saat foto dijepret di kamera SiSi (dikirim ke uploadFotoRow lat/lng/akurasiM).
  static void _skemaV6(Batch b) {
    for (final k in const ['lat REAL', 'lng REAL', 'akurasi_m REAL']) {
      b.execute('ALTER TABLE foto_antre ADD COLUMN $k');
    }
  }
}
