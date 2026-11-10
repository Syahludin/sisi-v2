import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/core/api_client.dart';
import 'package:sisi_row/features/wo/wo_sinkron.dart';

Map<String, dynamic> t(String id, [String status = '']) =>
    {'temuanId': id, 'kodeTemuan': 'K-$id', 'tanggal': '2026-11-01', 'wo': {'status': status}};

const ringkas0 = {'baru': 0, 'terkirim': 0, 'dikerjakan': 0, 'selesai': 0, 'ganda': 0};

class Dunia {
  Dunia({this.lokal, bool penuh = false, List<Object> jawaban = const []})
      : jawaban = [...jawaban],
        penuh = {if (penuh) 'k'};
  final ({Map<String, dynamic> data, int waktu})? lokal;
  final Set<String> penuh;
  final List<Object> jawaban;
  final List<String> log = [];
  final Map<String, Map<String, dynamic>> tersimpan = {};
  final List<({String aksi, Map<String, dynamic> data})> panggilan = [];

  StoreWo get store => StoreWo(
        baca: (k) async => lokal,
        tulis: (k, d) async {
          tersimpan[k] = d;
          log.add('tulis');
        },
        sudahPenuh: penuh.contains,
        tandaiPenuh: (k) {
          penuh.add(k);
          log.add('tandaiPenuh');
        },
      );

  Future<Map<String, dynamic>> api(String aksi, Map<String, dynamic> data) async {
    panggilan.add((aksi: aksi, data: data));
    log.add('api');
    final j = jawaban.removeAt(0);
    if (j is Exception) throw j;
    return j as Map<String, dynamic>;
  }
}

({Map<String, dynamic> data, int waktu}) lokalAda() => (
      data: {'status': 'SEMUA', 'kursor': 'k1', 'ringkas': ringkas0, 'tim': [], 'temuan': [t('a')]},
      waktu: 111,
    );

void main() {
  test('v1.0.58 sinkronDaftarWo: tanpa simpanan = satu panggilan penuh, simpanan ditulis, ditandai penuh', () async {
    final w = Dunia(jawaban: [
      {'status': 'SEMUA', 'kursor': 'k1', 'ringkas': ringkas0, 'tim': [], 'temuan': [t('a')]}
    ]);
    final h = await sinkronDaftarWo(kunci: 'k', aksi: 'getWoAdmin', param: {'dari': '2026-11-01'}, api: w.api, store: w.store);
    expect(w.panggilan.length, 1);
    expect(w.panggilan[0].data, {'dari': '2026-11-01', 'status': 'SEMUA'});
    expect(w.tersimpan['k'], h.data);
    expect(h.gagal, false);
    expect(w.log, ['api', 'tandaiPenuh', 'tulis']);
  });

  test('v1.0.58 sinkronDaftarWo: ada simpanan tapi belum penuh di peluncuran ini = panggilan penuh, bukan selisih', () async {
    final w = Dunia(lokal: lokalAda(), jawaban: [
      {'status': 'SEMUA', 'kursor': 'k2', 'ringkas': ringkas0, 'tim': [], 'temuan': [t('a'), t('b')]}
    ]);
    final h = await sinkronDaftarWo(kunci: 'k', aksi: 'getWoAdmin', param: {}, api: w.api, store: w.store);
    expect(w.panggilan[0].data.containsKey('sejak'), false);
    expect((h.data['temuan'] as List).length, 2);
    expect(w.penuh.contains('k'), true);
  });

  test('v1.0.58 sinkronDaftarWo: simpanan + sudah penuh = selisih (sejak = kursor), hasil digabung', () async {
    final w = Dunia(lokal: lokalAda(), penuh: true, jawaban: [
      {'status': 'SEMUA', 'selisih': true, 'kursor': 'k2', 'ringkas': {...ringkas0, 'terkirim': 1}, 'tim': [], 'temuan': [t('a', 'TERKIRIM')]}
    ]);
    final h = await sinkronDaftarWo(kunci: 'k', aksi: 'getWoPindah', param: {}, api: w.api, store: w.store);
    expect(w.panggilan[0].aksi, 'getWoPindah');
    expect(w.panggilan[0].data['sejak'], 'k1');
    expect(w.panggilan[0].data['status'], 'SEMUA');
    expect(h.data['kursor'], 'k2');
    expect(((h.data['temuan'] as List)[0] as Map)['wo'], {'status': 'TERKIRIM'});
    expect(w.tersimpan['k'], h.data);
  });

  test('v1.0.58 sinkronDaftarWo: paksaPenuh = panggilan penuh walau sudah penuh, temuan yang hilang di server ikut hilang', () async {
    final w = Dunia(lokal: lokalAda(), penuh: true, jawaban: [
      {'status': 'SEMUA', 'kursor': 'k3', 'ringkas': ringkas0, 'tim': [], 'temuan': []}
    ]);
    final h = await sinkronDaftarWo(kunci: 'k', aksi: 'getWoAdmin', param: {}, api: w.api, store: w.store, paksaPenuh: true);
    expect(w.panggilan[0].data.containsKey('sejak'), false);
    expect(h.data['temuan'], isEmpty);
  });

  test('v1.0.58 sinkronDaftarWo: panggilan gagal dengan simpanan = data lokal kembali (gagal true), simpanan tidak ditimpa, tidak ditandai penuh', () async {
    final w = Dunia(lokal: lokalAda(), jawaban: [ApiException('HTTP_500')]);
    final h = await sinkronDaftarWo(kunci: 'k', aksi: 'getWoAdmin', param: {}, api: w.api, store: w.store);
    expect(h.gagal, true);
    expect(h.waktuLokal, 111);
    expect(h.data, w.lokal!.data);
    expect(w.log, ['api']);
    expect(w.penuh.contains('k'), false);
  });

  test('v1.0.58 sinkronDaftarWo: penolakan server (AKSES_DITOLAK) dengan simpanan tetap dilempar, simpanan tidak ditandai penuh', () async {
    final w = Dunia(lokal: lokalAda(), jawaban: [ApiException('AKSES_DITOLAK')]);
    await expectLater(
        sinkronDaftarWo(kunci: 'k', aksi: 'getWoAdmin', param: {}, api: w.api, store: w.store),
        throwsA(isA<ApiException>().having((e) => e.kode, 'kode', 'AKSES_DITOLAK')));
    expect(w.penuh.contains('k'), false);
  });

  test('v1.0.58 sinkronDaftarWo: gagal tanpa simpanan = ApiException asli dilempar', () async {
    final w = Dunia(jawaban: [ApiException('HTTP_500')]);
    await expectLater(
        sinkronDaftarWo(kunci: 'k', aksi: 'getWoAdmin', param: {}, api: w.api, store: w.store),
        throwsA(isA<ApiException>().having((e) => e.kode, 'kode', 'HTTP_500')));
  });

  test('v1.0.58 sinkronDaftarWo: tampilLokal dipanggil sebelum api, dengan data dan waktu simpanan', () async {
    final w = Dunia(lokal: lokalAda(), jawaban: [
      {'status': 'SEMUA', 'kursor': 'k2', 'ringkas': ringkas0, 'tim': [], 'temuan': []}
    ]);
    final urut = <Object>[];
    await sinkronDaftarWo(
      kunci: 'k', aksi: 'getWoAdmin', param: {}, store: w.store,
      api: (a, d) {
        urut.add('api');
        return w.api(a, d);
      },
      tampilLokal: (d, waktu) => urut.add(['lokal', d['kursor'], waktu]),
    );
    expect(urut, [['lokal', 'k1', 111], 'api']);
  });
}
