import '../data/local_db.dart';
import '../features/auth/auth_repository.dart';
import '../features/master/master_repository.dart';
import '../features/row/foto_repository.dart';
import '../features/row/laporan_repository.dart';
import '../features/row/row_outbox.dart';
import '../features/row/row_repository.dart';
import '../features/row/sync_service.dart';
import 'api_client.dart';
import 'guard_lokasi.dart';
import 'session_store.dart';
import 'sync_controller.dart';

/// Semua objek dibuat sekali di sini. Tidak ada singleton global lain.
class Deps {
  Deps._({
    required this.api,
    required this.db,
    required this.sessionStore,
    required this.auth,
    required this.master,
    required this.outbox,
    required this.row,
    required this.sync,
    required this.syncCtl,
    required this.foto,
    required this.laporan,
    required this.guardLokasi,
  });

  final ApiClient api;
  final LocalDb db;
  final SessionStore sessionStore;
  final AuthRepository auth;
  final MasterRepository master;
  final RowOutbox outbox;
  final RowRepository row;
  final SyncService sync;
  final SyncController syncCtl;
  final FotoRepository foto;
  final LaporanRepository laporan;
  final GuardLokasi guardLokasi;

  static Future<Deps> siapkan() async {
    final api = ApiClient();
    final db = await LocalDb.buka();
    final store = SessionStore();
    final outbox = RowOutbox(db);
    final row = RowRepository(db, outbox);
    final sync = SyncService(api, outbox, row);
    final foto = FotoRepository(api, db);
    final laporan = LaporanRepository(api, db);
    final auth = AuthRepository(api, store);
    return Deps._(
      api: api,
      db: db,
      sessionStore: store,
      auth: auth,
      master: MasterRepository(api, db),
      outbox: outbox,
      row: row,
      sync: sync,
      syncCtl: SyncController(sync, outbox, foto, laporan),
      foto: foto,
      laporan: laporan,
      guardLokasi: GuardLokasi(auth),
    );
  }
}
