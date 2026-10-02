import '../data/local_db.dart';
import '../features/auth/auth_repository.dart';
import '../features/master/master_repository.dart';
import '../features/row/row_outbox.dart';
import '../features/row/sync_service.dart';
import 'api_client.dart';
import 'session_store.dart';

/// Semua objek dibuat sekali di sini. Tidak ada singleton global lain.
class Deps {
  Deps._({
    required this.api,
    required this.db,
    required this.sessionStore,
    required this.auth,
    required this.master,
    required this.outbox,
    required this.sync,
  });

  final ApiClient api;
  final LocalDb db;
  final SessionStore sessionStore;
  final AuthRepository auth;
  final MasterRepository master;
  final RowOutbox outbox;
  final SyncService sync;

  static Future<Deps> siapkan() async {
    final api = ApiClient();
    final db = await LocalDb.buka();
    final store = SessionStore();
    final outbox = RowOutbox(db);
    return Deps._(
      api: api,
      db: db,
      sessionStore: store,
      auth: AuthRepository(api, store),
      master: MasterRepository(api, db),
      outbox: outbox,
      sync: SyncService(api, outbox),
    );
  }
}
