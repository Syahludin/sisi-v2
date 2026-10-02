import 'dart:convert';

import '../../core/api_client.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import 'row_outbox.dart';

class HasilSync {
  HasilSync({this.terkirim = 0, this.konflik = 0, this.ditolak = 0, this.catatan});
  final int terkirim;
  final int konflik;
  final int ditolak;
  final String? catatan;
}

/// Kirim outbox lewat syncRow (PRD F-ROW-SYNC, 6. Endpoint > syncRow).
/// Status server per operasi: OK | DUPLIKAT | KODE_BENTROK | KONFLIK_REVISION | DITOLAK.
class SyncService {
  SyncService(this._api, this._outbox);

  final ApiClient _api;
  final RowOutbox _outbox;

  Future<HasilSync> kirim(Sesi s) async {
    final ops = await _outbox.tertunda(s.userId);
    if (ops.isEmpty) return HasilSync(catatan: 'Tidak ada data tertunda.');

    final Map<String, dynamic> d;
    try {
      d = await _api.call('syncRow', token: s.token, data: {
        'operasi': [
          for (final o in ops)
            {
              'opId': o['op_id'],
              'jenis': o['jenis'],
              'aksi': o['aksi'],
              'id': o['id'],
              'kode': o['kode'],
              'revision': o['revision'],
              'waktuPerangkat': o['waktu_perangkat'],
              'isi': jsonDecode(o['isi'] as String),
            }
        ],
      });
    } on ApiException catch (e) {
      if (e.kode == KodeError.belumDiimplementasi) {
        return HasilSync(catatan: 'Sync ROW belum aktif di server. Data aman di HP.');
      }
      rethrow; // sesi habis / server sibuk ditangani pemanggil, outbox tidak berubah
    }

    var ok = 0, konflik = 0, ditolak = 0;
    final hasil = d['hasil'];
    if (hasil is List) {
      for (final h in hasil.whereType<Map<dynamic, dynamic>>()) {
        final opId = h['opId'] as String?;
        if (opId == null) continue;
        switch (h['status']) {
          case 'OK':
          case 'DUPLIKAT':
            await _outbox.tandai(opId, 'TERKIRIM');
            ok++;
          case 'KODE_BENTROK':
          case 'KONFLIK_REVISION':
            await _outbox.tandai(opId, 'KONFLIK', alasan: h['status'] as String);
            konflik++;
          case 'DITOLAK':
            await _outbox.tandai(opId, 'DITOLAK', alasan: h['alasan'] as String?);
            ditolak++;
          default:
            // status tak dikenal: biarkan TERTUNDA, jangan tebak
            break;
        }
      }
    }
    return HasilSync(terkirim: ok, konflik: konflik, ditolak: ditolak);
  }
}
