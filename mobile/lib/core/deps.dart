import 'dart:async';

import '../data/local_db.dart';
import '../features/auth/auth_repository.dart';
import '../features/gardu/gardu_repository.dart';
import '../features/hartek/hartek_store.dart';
import '../features/insdu/insdu_store.dart';
import '../features/insjar/insjar_store.dart';
import '../features/insjar/temuan_admin_antre.dart';
import '../features/master/master_repository.dart';
import '../features/row/foto_repository.dart';
import '../features/row/laporan_repository.dart';
import '../features/row/perbaikan_repository.dart';
import '../features/row/row_outbox.dart';
import '../features/row/row_repository.dart';
import '../features/row/sync_service.dart';
import '../features/wo/wo_penerusan.dart';
import '../features/wo/wo_store.dart';
import '../features/yandal/p0_repository.dart';
import '../features/yandal/p0_sync.dart';
import '../features/yandal/yandal_arsip_repository.dart';
import 'api_client.dart';
import 'guard_lokasi.dart';
import 'jam_terpercaya.dart';
import 'notifikasi.dart';
import 'session_store.dart';
import 'sinkron_latar.dart';
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
    required this.perbaikan,
    required this.yandalArsip,
    required this.p0,
    required this.jam,
    required this.gardu,
    required this.notif,
    required this.hartek,
    required this.insjar,
    required this.insdu,
    required this.wo,
    required this.temuanAdmin,
    required this.latar,
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
  final PerbaikanRepository perbaikan; // v0.62 (M4)
  final YandalArsipRepository yandalArsip; // v0.63.5: Arsip P0 + Rank Yandal
  final P0Repository p0; // v0.64.0: P0 shift berjalan di HP
  final JamTerpercaya jam; // v0.64.2: jam server + jam monoton (waktu pekerjaan & akhir shift)
  final GarduRepository gardu; // v0.69.0: Master Gardu (Pengukuran Gardu, Berita Acara)
  final Notifikasi notif; // v0.83.0: push FCM pengingat login Yandal
  final HartekStore hartek; // v0.95.0: laporan Hartek di HP + antrean kirim otomatis
  final InsJarStore insjar; // v1.0.0: Inspeksi Jaringan di HP + antrean kirim otomatis
  final InsDuStore insdu; // v1.0.12: Inspeksi Gardu di HP + antrean kirim otomatis
  final WoStore wo; // v1.0.16: WO tindak lanjut tim di HP (offline) + antrean kirim otomatis
  final AntreanTemuanAdmin temuanAdmin; // v1.0.29: temuan inspeksi admin dikirim di latar
  final SinkronLatar latar; // v1.0.12: sinkron tetap jalan saat app di latar belakang

  static Future<Deps> siapkan() async {
    final api = ApiClient();
    final jam = JamTerpercaya();
    await jam.muat();
    api.onWaktuServer = (w) => unawaited(jam.setelServer(w));
    final db = await LocalDb.buka();
    final store = SessionStore();
    final outbox = RowOutbox(db);
    final row = RowRepository(db, outbox);
    final sync = SyncService(api, outbox, row);
    final foto = FotoRepository(api, db);
    final laporan = LaporanRepository(api, db);
    final auth = AuthRepository(api, store);
    final p0 = P0Repository(db, jam);
    final notif = Notifikasi(api);
    await notif.siapkan();
    final gardu = GarduRepository(api, db);
    final hartek = HartekStore(
      GudangHartekSql(db),
      (s, aksi, data) => api.call(aksi, token: s.token, data: data),
      // Master Gardu untuk dropdown nomor gardu: diunduh kalau belum ada / sudah lebih dari 12 jam
      siapkanGardu: (s) async {
        final info = await gardu.info();
        if (info == null || DateTime.now().difference(info.diambil) > const Duration(hours: 12)) await gardu.segarkan(s);
      },
    );
    // v1.0.0: Inspeksi Jaringan, tabel lokal sama dengan Hartek (kunci user_id akun tim INSPEKSI_JARINGAN)
    final insjar = InsJarStore(GudangHartekSql(db), (s, aksi, data) => api.call(aksi, token: s.token, data: data));
    // v1.0.12: Inspeksi Gardu, tabel lokal sama (kunci user_id akun tim INSPEKSI_GARDU)
    final insdu = InsDuStore(GudangHartekSql(db), (s, aksi, data) => api.call(aksi, token: s.token, data: data));
    // v1.0.16: WO tindak lanjut offline, tabel sendiri (wo_lokal / wo_antre) karena akun tim ROW / HARTEK / YANDAL
    // juga memakai antrean modulnya
    final wo = WoStore(GudangHartekSql(db, tabelDoc: 'wo_lokal', tabelAntre: 'wo_antre'),
        (s, aksi, data) => api.call(aksi, token: s.token, data: data, timeout: Duration(seconds: aksi == 'uploadFotoWo' ? 90 : 60)));
    // v1.0.29: temuan inspeksi input admin (menu Temuan Inspeksi): simpan di HP, kirim di latar
    final temuanAdmin = AntreanTemuanAdmin(GudangHartekSql(db), (s, aksi, data) => api.call(aksi, token: s.token, data: data,
        timeout: Duration(seconds: aksi == 'uploadFotoTemuanInspeksi' ? 90 : 60)));
    final syncCtl = SyncController(
      sync,
      outbox,
      foto,
      laporan,
      p0: P0Sync(api, p0, jam),
      installId: store.installId,
      hartek: hartek,
      insjar: insjar,
      insdu: insdu,
      wo: wo,
      temuanAdmin: temuanAdmin,
      probeOnline: () async {
        await api.call('ping', timeout: const Duration(seconds: 12));
      },
    );
    // v1.0.17: koneksi pulih = antrean Penerusan WO admin yang tertahan sinyal langsung dikirim ulang
    bool? onlineLalu;
    syncCtl.addListener(() {
      final o = syncCtl.online;
      if (o == true && onlineLalu != true) PenerusanWo.i.sinyalPulih();
      onlineLalu = o;
    });
    return Deps._(
      api: api,
      db: db,
      sessionStore: store,
      auth: auth,
      master: MasterRepository(api, db),
      outbox: outbox,
      row: row,
      sync: sync,
      syncCtl: syncCtl,
      foto: foto,
      laporan: laporan,
      guardLokasi: GuardLokasi(auth),
      perbaikan: PerbaikanRepository(db, outbox),
      yandalArsip: YandalArsipRepository(api, db),
      p0: p0,
      jam: jam,
      gardu: gardu,
      notif: notif,
      hartek: hartek,
      insjar: insjar,
      insdu: insdu,
      wo: wo,
      temuanAdmin: temuanAdmin,
      latar: SinkronLatar(syncCtl),
    );
  }
}
