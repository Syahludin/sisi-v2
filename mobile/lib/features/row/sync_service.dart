import 'dart:convert';

import '../../core/api_client.dart';
import '../../core/sesi.dart';
import '../../core/wib.dart';
import 'row_outbox.dart';
import 'row_repository.dart';

class HasilSync {
  HasilSync({this.terkirim = 0, this.konflik = 0, this.ditolak = 0, this.catatan});
  final int terkirim;
  final int konflik;
  final int ditolak;
  final String? catatan;
}

/// Kirim outbox lewat syncRow (PRD F-ROW-SYNC, 6. Endpoint > syncRow), lalu tarik kode (getKodeRow).
/// Status server per operasi: OK | DUPLIKAT | KODE_BENTROK | KONFLIK_REVISION | DITOLAK.
class SyncService {
  SyncService(this._api, this._outbox, this._repo);

  final ApiClient _api;
  final RowOutbox _outbox;
  final RowRepository _repo;

  /// Kirim berombongan (maks 50 per kiriman) sampai antrean habis atau ada kiriman yang tidak maju.
  Future<HasilSync> kirim(Sesi s) async {
    var ok = 0, konflik = 0, ditolak = 0;
    for (var putaran = 0; putaran < 10; putaran++) {
      final ops = await _outbox.tertunda(s.userId);
      if (ops.isEmpty) break;
      final d = await _api.call('syncRow', token: s.token, data: {
        'operasi': [
          for (final o in ops)
            {
              'opId': o['op_id'],
              'jenis': o['jenis'],
              'aksi': o['aksi'],
              'id': o['id'],
              if (o['aksi'] == 'buat') 'kode': o['kode'],
              if (o['aksi'] != 'buat') 'revision': o['revision'],
              'waktuPerangkat': o['waktu_perangkat'],
              'isi': jsonDecode(o['isi'] as String),
            }
        ],
      });
      final perOp = {for (final o in ops) o['op_id'] as String: o};
      var maju = 0;
      final hasil = d['hasil'];
      if (hasil is List) {
        for (final h in hasil.whereType<Map<dynamic, dynamic>>()) {
          final op = perOp[h['opId']];
          if (op == null) continue;
          final status = h['status'] as String?;
          final alasan = (h['alasan'] as String?) ?? status;
          switch (status) {
            case 'OK':
            case 'DUPLIKAT':
              await _outbox.tandai(op['op_id'] as String, 'TERKIRIM');
              ok++;
            case 'KODE_BENTROK':
            case 'KONFLIK_REVISION':
              await _outbox.tandai(op['op_id'] as String, 'KONFLIK', alasan: alasan);
              konflik++;
            case 'DITOLAK':
              await _outbox.tandai(op['op_id'] as String, 'DITOLAK', alasan: alasan);
              ditolak++;
            default:
              continue; // status tak dikenal: biarkan TERTUNDA, jangan tebak
          }
          maju++;
          await _repo.terapkanHasil(op['jenis'] as String, op['id'] as String, status!,
              kode: h['kode'] as String?, revision: (h['revision'] as num?)?.toInt(), alasan: alasan);
        }
      }
      if (maju == 0) break;
    }
    return HasilSync(terkirim: ok, konflik: konflik, ditolak: ditolak);
  }

  /// getKodeRow untuk hari ini (wajib setelah login / reinstall sebelum membuat data baru).
  Future<void> tarikKode(Sesi s, {String? tanggal}) async {
    final d = await _api.call('getKodeRow', token: s.token, data: {if (tanggal != null) 'tanggal': tanggal});
    await _repo.simpanDariServer(s, d);
  }

  static String hariIni() => Wib.tanggal(DateTime.now());
}
