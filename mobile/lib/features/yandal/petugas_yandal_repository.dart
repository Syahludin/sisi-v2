import '../../core/api_client.dart';
import '../../core/sesi.dart';

/// v0.63.0: Pindah Tim Petugas Yandal (ADMIN / SUPER). Pure Dart kecuali pemanggilan API.
class TimYandal {
  const TimYandal({required this.timId, required this.nama, required this.kode});
  final String timId;
  final String nama;
  final String kode;

  factory TimYandal.dariJson(Map<String, dynamic> j) => TimYandal(timId: '${j['timId']}', nama: '${j['nama'] ?? ''}', kode: '${j['kode'] ?? ''}');
}

class PetugasYandal {
  const PetugasYandal({
    required this.petugasId,
    required this.nama,
    required this.timId,
    required this.aktif,
    required this.revision,
    this.bertugas = false,
  });
  final String petugasId;
  final String nama;
  final String timId;
  final bool aktif;
  final int revision;

  /// Sedang bertugas di shift saat ini (pindah tim tetap boleh, berlaku login berikutnya).
  final bool bertugas;

  factory PetugasYandal.dariJson(Map<String, dynamic> j) => PetugasYandal(
        petugasId: '${j['petugasId']}',
        nama: '${j['nama'] ?? ''}',
        timId: '${j['timId'] ?? ''}',
        aktif: j['aktif'] == true,
        revision: (j['revision'] as num?)?.toInt() ?? 0,
        bertugas: j['bertugas'] == true,
      );
}

class DataPetugasYandal {
  const DataPetugasYandal({required this.tim, required this.petugas, required this.min, required this.maks});
  final List<TimYandal> tim;
  final List<PetugasYandal> petugas;
  final int min;
  final int maks;

  factory DataPetugasYandal.dariJson(Map<String, dynamic> d) {
    final batas = (d['batas'] as Map<dynamic, dynamic>?) ?? const <dynamic, dynamic>{};
    return DataPetugasYandal(
      tim: [for (final t in (d['tim'] as List<dynamic>? ?? const <dynamic>[]).whereType<Map<dynamic, dynamic>>()) TimYandal.dariJson(Map<String, dynamic>.from(t))],
      petugas: [
        for (final p in (d['petugas'] as List<dynamic>? ?? const <dynamic>[]).whereType<Map<dynamic, dynamic>>())
          PetugasYandal.dariJson(Map<String, dynamic>.from(p)),
      ],
      min: (batas['min'] as num?)?.toInt() ?? 2,
      maks: (batas['maks'] as num?)?.toInt() ?? 8,
    );
  }
}

/// Perubahan yang belum disimpan (dikirim sekaligus, mis. satu SK). Belum disimpan = belum berlaku.
class DraftPetugasYandal {
  DraftPetugasYandal(this.data);
  final DataPetugasYandal data;
  final Map<String, ({String timId, bool aktif})> _ubah = {};
  final List<({String nama, String timId})> baru = [];

  PetugasYandal? _asli(String id) {
    for (final p in data.petugas) {
      if (p.petugasId == id) return p;
    }
    return null;
  }

  /// Tim + status setelah draft.
  ({String timId, bool aktif}) kini(PetugasYandal p) => _ubah[p.petugasId] ?? (timId: p.timId, aktif: p.aktif);

  bool berubah(String id) => _ubah.containsKey(id);
  int get jumlah => _ubah.length + baru.length;

  void _set(String id, String timId, bool aktif) {
    final a = _asli(id);
    if (a == null) return;
    if (a.timId == timId && a.aktif == aktif) {
      _ubah.remove(id);
    } else {
      _ubah[id] = (timId: timId, aktif: aktif);
    }
  }

  void pindah(String id, String timId) => _set(id, timId, true);
  void nonaktifkan(String id) {
    final a = _asli(id);
    if (a != null) _set(id, kini(a).timId, false);
  }

  void batal(String id) => _ubah.remove(id);

  /// Nama aktif (draft) sudah dipakai? Tanpa beda huruf besar / kecil.
  bool namaDipakai(String nama) {
    final k = nama.trim().toLowerCase();
    for (final p in data.petugas) {
      if (kini(p).aktif && p.nama.toLowerCase() == k) return true;
    }
    return baru.any((b) => b.nama.toLowerCase() == k);
  }

  void tambah(String nama, String timId) => baru.add((nama: nama.trim(), timId: timId));

  /// Anggota aktif per tim setelah draft.
  Map<String, int> jumlahPerTim() {
    final n = <String, int>{for (final t in data.tim) t.timId: 0};
    for (final p in data.petugas) {
      final k = kini(p);
      if (k.aktif && n.containsKey(k.timId)) n[k.timId] = n[k.timId]! + 1;
    }
    for (final b in baru) {
      if (n.containsKey(b.timId)) n[b.timId] = n[b.timId]! + 1;
    }
    return n;
  }

  Map<String, dynamic> payload() {
    final ubah = <Map<String, dynamic>>[];
    for (final e in _ubah.entries) {
      final a = _asli(e.key)!;
      ubah.add({
        'petugasId': e.key,
        'revision': a.revision,
        if (e.value.timId != a.timId) 'timId': e.value.timId,
        if (e.value.aktif != a.aktif) 'aktif': e.value.aktif,
      });
    }
    return {
      if (ubah.isNotEmpty) 'ubah': ubah,
      if (baru.isNotEmpty) 'baru': [for (final b in baru) {'nama': b.nama, 'timId': b.timId}],
    };
  }
}

class PetugasYandalRepository {
  PetugasYandalRepository(this._api);
  final ApiClient _api;

  static const menu = 'OPS_PETUGAS_YANDAL';

  Future<DataPetugasYandal> muat(Sesi s) async => DataPetugasYandal.dariJson(await _api.call('getPetugasYandal', token: s.token));

  Future<DataPetugasYandal> simpan(Sesi s, DraftPetugasYandal d) async =>
      DataPetugasYandal.dariJson(await _api.call('simpanPetugasYandal', token: s.token, data: d.payload()));
}
