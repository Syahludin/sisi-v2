import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/core/api_client.dart';
import 'package:sisi_row/core/sesi.dart';
import 'package:sisi_row/features/hartek/hartek_lokal.dart';
import 'package:sisi_row/features/hartek/hartek_store.dart';
import 'package:sisi_row/features/wo/wo_bantu.dart';
import 'package:sisi_row/features/wo/wo_store.dart';

/// Gudang di memori (salinan op dikembalikan, seperti sqflite).
class _Gudang implements GudangHartek {
  final docs = <String, String>{};
  final antre = <OpHartek>[];
  var _id = 0;

  OpHartek _salin(OpHartek o) => OpHartek(
      id: o.id, userId: o.userId, tanggal: o.tanggal, aksi: o.aksi, target: o.target, data: {...o.data}, status: o.status, galat: o.galat);

  @override
  Future<String?> bacaDoc(String userId, String tanggal) async => docs['$userId|$tanggal'];
  @override
  Future<void> tulisDoc(String userId, String tanggal, String json) async => docs['$userId|$tanggal'] = json;
  @override
  Future<void> hapusDoc(String userId, String tanggal) async => docs.remove('$userId|$tanggal');
  @override
  Future<List<OpHartek>> ops(String userId) async => [for (final o in antre) if (o.userId == userId) _salin(o)];
  @override
  Future<int> tambahOp(OpHartek op) async {
    op.id = ++_id;
    antre.add(_salin(op));
    return op.id;
  }

  @override
  Future<void> ubahOp(OpHartek op) async {
    final i = antre.indexWhere((o) => o.id == op.id);
    if (i >= 0) antre[i] = _salin(op);
  }

  @override
  Future<void> aturStatusOp(int id, String status, String? galat) async {
    for (final o in antre) {
      if (o.id == id) {
        o.status = status;
        o.galat = galat;
      }
    }
  }

  @override
  Future<void> hapusOp(int id) async => antre.removeWhere((o) => o.id == id);
  @override
  Future<void> bersihkan(String userId, String sebelumTanggal) async {}
  @override
  Future<({String json, DateTime diambil})?> bacaMaster(String kunci) async => null;
  @override
  Future<void> tulisMaster(String kunci, String json) async {}
}

final _sesi = Sesi.dariLogin({
  'token': 'b' * 64,
  'profil': {'userId': 'u-row', 'username': 'row01', 'role': 'PETUGAS', 'jenisTim': 'ROW', 'timId': 'tim-row'},
  'menu': [
    {'kode': 'OPS_WO_TIM', 'aksi': 'UBAH'},
  ],
  'offlineSampai': '2026-10-22T23:59:59+07:00',
});

Map<String, dynamic> _wo(String id, String status, {Map<String, dynamic>? ganda, List<Map<String, dynamic>> pekerjaan = const []}) => {
      'temuanId': id,
      'kodeTemuan': 'K-$id',
      'jenisTemuan': 'Pohon dekat jaringan',
      'penyulang': 'TB-01',
      'koordinat': '-3.000000, 106.500000',
      'revision': 2,
      'wo': {'status': status, 'timId': 'tim-row', if (ganda != null) 'ganda': ganda},
      'pekerjaanWo': pekerjaan,
      'foto': const <String, dynamic>{},
    };

/// Server palsu getWoTim + aksi WO. [aturan] = kode galat per aksi (sekali pakai).
({WoStore store, _Gudang gudang, List<String> panggil, Map<String, dynamic> srv, Map<String, List<String>> galat, List<String> dihapus}) _konteks() {
  final g = _Gudang();
  final panggil = <String>[];
  final galat = <String, List<String>>{};
  final dihapus = <String>[];
  final srv = <String, dynamic>{'jenisTim': 'ROW', 'laporanUtamaAda': true, 'slotWajib': ['SEBELUM', 'PEKERJAAN', 'SESUDAH'], 'master': {}, 'wo': <dynamic>[]};
  final store = WoStore(
    g,
    (s, aksi, data) async {
      panggil.add(data['paksa'] == true ? '$aksi(paksa)' : aksi);
      final k = galat[aksi];
      if (k != null && k.isNotEmpty) throw ApiException(k.removeAt(0));
      switch (aksi) {
        case 'getWoTim':
          return jsonDecode(jsonEncode(srv)) as Map<String, dynamic>;
        case 'mulaiWo':
          return {'temuanId': data['temuanId'], 'revision': 3, if (data['paksa'] == true) 'ganda': true, 'temuan': _wo('${data['temuanId']}', 'DIKERJAKAN')};
        case 'simpanPekerjaanWo':
          return {'tlId': data['idBaris'], 'kodeTl': 'K-TL.001', 'pekerjaan': {'tlId': data['idBaris'], 'pekerjaan': 'Tebang Sedang', 'status': 'DRAFT', 'foto': {}}};
        case 'uploadFotoWo':
          return {'tlId': data['tlId'], 'slot': data['slot'], 'link': 'https://drive/${data['slot']}', 'status': 'OK'};
        case 'selesaiWo':
          return {'temuanId': data['temuanId'], 'revision': 4, 'temuan': _wo('${data['temuanId']}', 'SELESAI')};
      }
      return const {};
    },
    bacaFoto: (p) async => [0xFF, 0xD8, 1, 2, 3],
    hapusFoto: (p) async {
      if (p != null && p.isNotEmpty) dihapus.add(p);
    },
  );
  return (store: store, gudang: g, panggil: panggil, srv: srv, galat: galat, dihapus: dihapus);
}

void main() {
  test('v1.0.16 wo_bantu: navigasi Google Maps, rincian Hartek bertingkat, baris tampil, foto HP dihitung ada', () {
    expect(uriNavigasiWo('-3.012345, 106.512345').toString(),
        'https://www.google.com/maps/dir/?api=1&destination=-3.012345,106.512345&travelmode=driving');
    expect(uriNavigasiWo(''), isNull);
    expect(uriNavigasiWo('abc'), isNull);
    var i = 0;
    // v1.0.17: material menempel ke pekerjaan yang memakainya (material_<pekerjaan>_<urut>)
    final r = rincianHartekWo({
      'pekerjaan_1': 'jh1', 'jumlah_1': '3', 'pekerjaan_2': '', 'pekerjaan_3': 'jh2', 'jumlah_3': '1,5',
      'material_1_1': 'mat-1', 'jumlahMaterial_1_1': '12', 'kepemilikan_1_1': 'PLN',
      'material_3_1': 'mat-2', 'jumlahMaterial_3_1': '2', 'kepemilikan_3_1': 'Pelanggan',
      'material_2_1': 'mat-x', // pekerjaan ke-2 kosong: materialnya diabaikan
    }, () => 'id${++i}');
    expect(r['pekerjaan'], [
      {'jenisId': 'jh1', 'jumlah': 3, 'material': [
        {'id': 'id1', 'materialId': 'mat-1', 'jumlah': 12, 'kepemilikan': 'PLN'},
      ]},
      {'id': 'id3', 'jenisId': 'jh2', 'jumlah': 1.5, 'material': [
        {'id': 'id2', 'materialId': 'mat-2', 'jumlah': 2, 'kepemilikan': 'Pelanggan'},
      ]},
    ]);
    expect(r.containsKey('material'), isFalse);
    expect(jumlahMaterialRincianWo(r), 2);
    // rincian server lama (material di luar pekerjaan) = milik pekerjaan pertama; baru = per pekerjaan
    expect(materialPerPekerjaanWo({
      'pekerjaan': [{'id': 'a'}, {'id': 'b'}],
      'material': [{'id': 'm1', 'nama': 'Kabel'}],
    }).map((l) => l.map((m) => m['id']).toList()).toList(), [['m1'], []]);
    expect(materialPerPekerjaanWo({
      'pekerjaan': [{'id': 'a', 'material': [{'id': 'm1'}]}, {'id': 'b', 'material': [{'id': 'm2'}]}],
      'material': [{'id': 'm1', 'pekerjaanId': 'a'}, {'id': 'm2', 'pekerjaanId': 'b'}],
    }).map((l) => l.map((m) => m['id']).toList()).toList(), [['m1'], ['m2']], reason: 'daftar datar server tidak menggandakan');
    expect(ringkasPekerjaanWo({'rincian': {'pekerjaan': [
      {'id': 'a', 'nama': 'Ganti Arrester', 'jumlah': 1, 'satuan': 'Bh', 'material': [{'id': 'm1', 'nama': 'Arrester', 'jumlah': 3, 'satuan': 'Bh', 'kepemilikan': 'PLN'}]},
      {'id': 'b', 'nama': 'Pasang Grounding', 'jumlah': 2, 'satuan': 'Titik'},
    ]}}), 'Ganti Arrester 1 Bh (Arrester 3 Bh PLN), Pasang Grounding 2 Titik');
    expect(kunciMaterialWo('kepemilikan', 2, 3), 'kepemilikan_2_3');
    expect(barisTampilWo({}, 'pekerjaan', 15), 1);
    expect(barisTampilWo({'pekerjaan_1': 'a', 'pekerjaan_2': 'b'}, 'pekerjaan', 15), 3);
    expect(barisTampilWo({'material_2': 'x'}, 'material', 2), 2, reason: 'maksimal tidak terlewati');
    final p = {'status': 'DRAFT', 'foto': {'SEBELUM': 'link'}, kunciFotoHpWo: {'PEKERJAAN': '/hp/a.jpg'}};
    expect(fotoKurangWo(p, const ['SEBELUM', 'PEKERJAAN', 'SESUDAH']), ['SESUDAH']);
    final t = {'wo': {'status': 'DIKERJAKAN'}, 'pekerjaanWo': [p]};
    // v1.0.17: foto di HP belum dihitung "ada" (tunda) sampai diterima server
    expect(progresFotoWo(t, const ['SEBELUM', 'PEKERJAAN', 'SESUDAH']), (ada: 1, wajib: 3, tunda: 1));
    expect(alasanBelumSelesai(t, const ['SEBELUM', 'PEKERJAAN', 'SESUDAH']), '1 foto wajib belum diambil.');
  });

  test('v1.0.17 (bug WO ROW): perbarui foto Pekerjaan saat foto Sesudah belum terunggah = belum lengkap, bukan sukses', () {
    const wajib = ['SEBELUM', 'PEKERJAAN', 'SESUDAH'];
    // Sebelum + Pekerjaan sudah di server, Sesudah baru di HP (antrean)
    final p = {
      'status': 'DRAFT',
      'foto': {'SEBELUM': 'l1', 'PEKERJAAN': 'l2'},
      kunciFotoHpWo: {'SESUDAH': '/hp/s.jpg'},
      kunciFotoSinkronWo: {'SESUDAH': 'LOKAL'},
    };
    final t = {'wo': {'status': 'DIKERJAKAN'}, 'pekerjaanWo': [p]};
    final fp = progresFotoWo(t, wajib);
    expect(fp.ada == fp.wajib, isFalse, reason: 'kartu tidak boleh hijau / lengkap sebelum Sesudah diterima server');
    expect((fp.ada, fp.tunda), (2, 1));
    expect(sisaSinkronWo(t), (pekerjaan: 0, foto: 1, ditolak: 0));
    // Sesudah ditolak server = dihitung belum ada, Selesai ditahan dengan alasan
    final ditolak = {...p, kunciFotoSinkronWo: {'SESUDAH': 'GAGAL'}};
    final t2 = {'wo': {'status': 'DIKERJAKAN'}, 'pekerjaanWo': [ditolak]};
    expect(fotoKurangWo(ditolak, wajib), ['SESUDAH']);
    expect(alasanBelumSelesai(t2, wajib), '1 data WO ditolak server. Kirim ulang atau perbaiki dulu.');
    // Selesai di HP belum "Selesai": label proses sinkron
    expect(statusTampilWo({'wo': {'status': 'DIKERJAKAN'}, '_selesai': {'status': 'LOKAL'}}), 'Proses sinkron');
    expect(statusTampilWo({'wo': {'status': 'SELESAI'}}), 'Selesai');
  });

  test('v1.0.16 WoStore: mulai + pekerjaan + foto + selesai tanpa sinyal, terkirim berurutan saat online', () async {
    final x = _konteks();
    x.srv['wo'] = [_wo('t1', 'TERKIRIM')];
    await x.store.tarik(_sesi);
    final t = WoLokal.gabung(await x.store.doc(_sesi)).single;
    // offline: semua di HP
    await x.store.mulai(_sesi, t);
    var tampil = WoLokal.gabung(await x.store.doc(_sesi)).single;
    expect([statusWoDari(tampil), tampil['_lokalMulai']], ['DIKERJAKAN', true]);
    await x.store.simpanPekerjaan(_sesi, tampil, 'tl-1', {'koordinat': '-3.01, 106.51', 'diameter': 30}, {'pekerjaan': 'Tebang Sedang', 'diameter': 30},
        {'SEBELUM': '/hp/seb.jpg'});
    await x.store.tambahFoto(_sesi, tampil, 'tl-1', 'PEKERJAAN', '/hp/pek.jpg');
    await x.store.tambahFoto(_sesi, tampil, 'tl-1', 'SESUDAH', '/hp/ses.jpg');
    tampil = WoLokal.gabung(await x.store.doc(_sesi)).single;
    final p = WoLokal.daftar(tampil['pekerjaanWo']).single;
    expect([p['_lokal'], p[HartekLokal.sinkron], HartekLokal.fotoDiHp(p).keys.toList()], [true, 'LOKAL', ['SEBELUM', 'PEKERJAAN', 'SESUDAH']]);
    expect(alasanBelumSelesai(tampil, const ['SEBELUM', 'PEKERJAAN', 'SESUDAH']), isNull, reason: 'foto HP = siap Selesai');
    await x.store.selesai(_sesi, tampil, const {});
    expect(await x.store.jumlahTertunda(_sesi.userId), 6);
    // online: FIFO mulai > pekerjaan > foto x3 > selesai, lalu tarik
    x.srv['wo'] = [_wo('t1', 'SELESAI', pekerjaan: [{'tlId': 'tl-1', 'status': 'TERCATAT', 'foto': {'SEBELUM': 'a', 'PEKERJAAN': 'b', 'SESUDAH': 'c'}}])];
    final h = await x.store.kirim(_sesi);
    expect(h.terkirim, 6);
    expect(x.panggil, ['getWoTim', 'mulaiWo', 'simpanPekerjaanWo', 'uploadFotoWo', 'uploadFotoWo', 'uploadFotoWo', 'selesaiWo', 'getWoTim']);
    expect(x.dihapus, ['/hp/seb.jpg', '/hp/pek.jpg', '/hp/ses.jpg'], reason: 'file foto dihapus sesudah diterima');
    expect(await x.store.jumlahTertunda(_sesi.userId), 0);
    final d = await x.store.doc(_sesi);
    expect(WoLokal.peta(d, 'lokal'), isEmpty, reason: 'isian HP dibersihkan sesudah server memuatnya');
    expect(statusWoDari(WoLokal.gabung(d).single), 'SELESAI');
  });

  test('v1.0.16 WoStore: WO dipindah saat offline = antrean ditahan, tetap unggah = klaim paksa, Selesai ditahan sampai admin memilih', () async {
    final x = _konteks();
    x.srv['wo'] = [_wo('t1', 'TERKIRIM')];
    await x.store.tarik(_sesi);
    final t = WoLokal.gabung(await x.store.doc(_sesi)).single;
    await x.store.mulai(_sesi, t);
    await x.store.simpanPekerjaan(_sesi, t, 'tl-1', {'koordinat': '-3.01, 106.51', 'diameter': 30}, {'pekerjaan': 'Tebang Sedang'}, const {});
    // admin memindah WO ke tim lain: daftar server tidak memuatnya lagi, kiriman pertama WO_DIPINDAH
    x.srv['wo'] = <dynamic>[];
    x.galat['mulaiWo'] = ['WO_DIPINDAH'];
    await x.store.kirim(_sesi);
    var tampil = WoLokal.gabung(await x.store.doc(_sesi));
    expect([tampil.length, tampil.single['_konflik']], [1, 'WO_DIPINDAH'], reason: 'WO tetap tampil dari salinan HP + kartu pilihan');
    expect(x.panggil.where((a) => a == 'simpanPekerjaanWo'), isEmpty, reason: 'antrean WO ditahan');
    // petugas memilih tetap unggah: klaim paksa lalu pekerjaan terkirim
    await x.store.lanjutkanKonflik(_sesi, 't1');
    x.srv['wo'] = [_wo('t1', 'TERKIRIM', ganda: {'status': 'KLAIM', 'pemilik': false, 'menunggu': true})];
    x.panggil.clear();
    await x.store.kirim(_sesi);
    expect(x.panggil, ['mulaiWo(paksa)', 'simpanPekerjaanWo', 'getWoTim']);
    tampil = WoLokal.gabung(await x.store.doc(_sesi));
    expect([tampil.single['_klaim'], statusWoDari(tampil.single), tampil.single['_konflik']], [true, 'DIKERJAKAN', null]);
    // Selesai ditahan server
    await x.store.selesai(_sesi, tampil.single, const {});
    x.galat.clear();
    x.srv['wo'] = [_wo('t1', 'TERKIRIM', ganda: {'status': 'SIAP', 'pemilik': false, 'menunggu': true}, pekerjaan: [{'tlId': 'tl-1', 'status': 'DRAFT', 'foto': {}}])];
    // HP yang sama (gudang disalin), server menjawab Selesai = menungguVerifikasi lalu admin memilih tim ini
    final g2 = _Gudang()..docs.addAll(x.gudang.docs)..antre.addAll(x.gudang.antre);
    final panggil2 = <String>[];
    var dipilih = false;
    final s2 = WoStore(g2, (s, aksi, data) async {
      panggil2.add(aksi);
      if (aksi == 'selesaiWo') return dipilih ? {'temuanId': 't1', 'revision': 6, 'temuan': _wo('t1', 'SELESAI')} : {'temuanId': 't1', 'menungguVerifikasi': true};
      if (aksi == 'getWoTim') {
        return jsonDecode(jsonEncode({
          ...x.srv,
          'wo': [
            dipilih
                ? _wo('t1', 'DIKERJAKAN', ganda: {'status': 'DIPILIH', 'pemilik': true, 'menunggu': false}, pekerjaan: [{'tlId': 'tl-1', 'status': 'DRAFT', 'foto': {}}])
                : _wo('t1', 'TERKIRIM', ganda: {'status': 'SIAP', 'pemilik': false, 'menunggu': true}, pekerjaan: [{'tlId': 'tl-1', 'status': 'DRAFT', 'foto': {}}]),
          ],
        })) as Map<String, dynamic>;
      }
      return const {};
    });
    await s2.kirim(_sesi);
    var d = await s2.doc(_sesi);
    expect(statusTampilWo(WoLokal.gabung(d).single), 'Menunggu verifikasi');
    // admin memilih tim ini: Selesai dikirim ulang otomatis + kabar
    dipilih = true;
    panggil2.clear();
    await s2.kirim(_sesi);
    expect(panggil2, ['getWoTim', 'selesaiWo', 'getWoTim']);
    d = await s2.doc(_sesi);
    expect(WoLokal.daftar(d['kabar']).map((k) => k['kunci']), ['dipilih-t1']);
    await s2.tutupKabar(_sesi, 'dipilih-t1');
    expect(WoLokal.daftar((await s2.doc(_sesi))['kabar']), isEmpty);
  });

  test('v1.0.16 WoStore: admin memilih tim lain = WO, antrean, dan foto HP dibuang + kabar', () async {
    final x = _konteks();
    x.srv['wo'] = [_wo('t1', 'DIKERJAKAN')];
    await x.store.tarik(_sesi);
    final t = WoLokal.gabung(await x.store.doc(_sesi)).single;
    await x.store.simpanPekerjaan(_sesi, t, 'tl-1', {'koordinat': '-3.01, 106.51', 'diameter': 30}, {'pekerjaan': 'Tebang Sedang'}, {'SEBELUM': '/hp/a.jpg'});
    x.galat['simpanPekerjaanWo'] = ['KODE_LAIN'];
    x.srv['wo'] = [_wo('t1', 'DIKERJAKAN', ganda: {'status': 'DITOLAK', 'pemilik': false, 'menunggu': false, 'catatan': 'ROW lain yang ke lokasi'})];
    await x.store.kirim(_sesi);
    final d = await x.store.doc(_sesi);
    expect(WoLokal.gabung(d), isEmpty, reason: 'WO ditolak tidak tampil');
    expect(WoLokal.peta(d, 'lokal'), isEmpty);
    expect(await x.store.jumlahTertunda(_sesi.userId), 0);
    expect(x.dihapus, contains('/hp/a.jpg'));
    final k = WoLokal.daftar(d['kabar']).single;
    expect([k['kunci'], (k['isi'] as String).contains('ROW lain yang ke lokasi')], ['ditolak-t1', true]);
  });

  test('v1.0.16 WoStore: hapus pekerjaan belum terkirim = buang antrean; batalkan WO dipindah = isian HP dihapus', () async {
    final x = _konteks();
    x.srv['wo'] = [_wo('t1', 'DIKERJAKAN', pekerjaan: [{'tlId': 'srv-1', 'pekerjaan': 'Rabas', 'status': 'DRAFT', 'revision': 2, 'foto': {}}])];
    await x.store.tarik(_sesi);
    final t = WoLokal.gabung(await x.store.doc(_sesi)).single;
    await x.store.simpanPekerjaan(_sesi, t, 'tl-1', {'koordinat': '-3.01, 106.51', 'diameter': 30}, {'pekerjaan': 'Tebang Sedang'}, {'SEBELUM': '/hp/a.jpg'});
    await x.store.hapusPekerjaan(_sesi, 't1', {'tlId': 'tl-1'});
    expect(await x.store.jumlahTertunda(_sesi.userId), 0, reason: 'pekerjaan + foto belum terkirim dibuang');
    await x.store.hapusPekerjaan(_sesi, 't1', {'tlId': 'srv-1', 'revision': 2});
    final ops = await x.gudang.ops(_sesi.userId);
    expect([ops.single.aksi, ops.single.data['revision']], ['hapus', 2]);
    expect(WoLokal.daftar(WoLokal.gabung(await x.store.doc(_sesi)).single['pekerjaanWo']), isEmpty, reason: 'disembunyikan sampai terkirim');
    await x.store.batalkanWo(_sesi, 't1');
    expect(await x.store.jumlahTertunda(_sesi.userId), 0);
    expect(WoLokal.peta(await x.store.doc(_sesi), 'lokal'), isEmpty);
  });
}
