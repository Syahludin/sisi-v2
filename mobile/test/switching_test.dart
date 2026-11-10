import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/core/api_client.dart';
import 'package:sisi_row/core/sesi.dart';
import 'package:sisi_row/features/switching/switching_form_screen.dart';
import 'package:sisi_row/features/switching/switching_model.dart';
import 'package:sisi_row/features/switching/switching_repository.dart';

Map<String, dynamic> _sw(Map<String, dynamic> o) => {
      'switchingId': 'SWC-0001',
      'jenis': 'LBS',
      'nama': 'LBS A',
      'penyulang': 'TOBOALI 1',
      'lat': -3.01,
      'lng': 106.5,
      'statusVerifikasi': 'TERVERIFIKASI',
      'aktif': true,
      'revision': 1,
      'foto': {'UNIT': true, 'NAMEPLATE': false, 'KONTROLER': false},
      ...o,
    };

final _data = DataSwitching.dariJson({
  'switching': [
    _sw({}),
    _sw({'switchingId': 'SWC-0002', 'jenis': 'ACR', 'nama': 'ACR Palas', 'bisaTrip': true, 'merkKontroler': 'Schneider', 'statusVerifikasi': 'PERLU_PERBAIKAN'}),
    _sw({'switchingId': 'SWC-0003', 'jenis': 'FCO', 'nama': 'FCO B', 'penyulang': 'Payung', 'lat': null, 'lng': null, 'statusVerifikasi': 'BELUM'}),
    _sw({'switchingId': 'SWC-0004', 'nama': 'LBS Lama', 'aktif': false}),
  ],
  'jaringan': [
    {'sectionId': 's1', 'penyulang': 'TOBOALI 1', 'section': 'PMT TOBOALI 1'},
    {'sectionId': 's2', 'penyulang': 'TOBOALI 1', 'section': 'LBS AIR BARA'},
    {'sectionId': 's3', 'penyulang': 'Payung', 'section': 'PMT PAYUNG'},
  ],
  'waktu': '2026-11-08T07:00:00.000Z',
});

void main() {
  _uiTests();
  test('switching: data dari server + simpanan lokal bolak-balik', () {
    expect(_data.switching.length, 4);
    expect(_data.penyulang, ['Payung', 'TOBOALI 1']);
    expect(_data.sectionDari('TOBOALI 1').map((x) => x.sectionId), ['s1', 's2']);
    final ulang = DataSwitching.dariJson(_data.json);
    expect(ulang.switching.map((s) => s.id), ['SWC-0001', 'SWC-0002', 'SWC-0003', 'SWC-0004']);
    expect(ulang.switching.first.adaFoto('UNIT'), isTrue);
    expect(ulang.switching[2].adaTitik, isFalse);
    expect(_data.cari('SWC-0002')?.nama, 'ACR Palas');
  });

  test('switching: ringkasan hanya baris aktif + persen', () {
    final r = ringkasSwitching(_data.switching);
    expect([r.total, r.terverifikasi, r.perluPerbaikan, r.belum, r.nonaktif, r.tanpaTitik], [3, 1, 1, 1, 1, 1]);
    expect([r.jenis['LBS'], r.jenis['ACR'], r.jenis['FCO'], r.jenis['PMT']], [1, 1, 1, 0]);
    expect(r.persen, 33);
    expect(ringkasSwitching(const []).persen, 0);
  });

  test('switching: saring jenis / penyulang / status / cari / nonaktif', () {
    List<String> id({String jenis = '', String penyulang = '', String status = '', String cari = '', bool nonaktif = false}) =>
        saringSwitching(_data.switching, jenis: jenis, penyulang: penyulang, status: status, cari: cari, nonaktif: nonaktif).map((s) => s.id).toList();
    expect(id(), ['SWC-0001', 'SWC-0002', 'SWC-0003']);
    expect(id(jenis: 'ACR'), ['SWC-0002']);
    expect(id(penyulang: 'Payung'), ['SWC-0003']);
    expect(id(status: 'BELUM'), ['SWC-0003']);
    expect(id(cari: 'schneider'), ['SWC-0002']);
    expect(id(nonaktif: true), ['SWC-0004']);
  });

  test('switching: cek isian + payload (kolom tak berlaku dibuang, angka jadi num)', () {
    final i = IsianSwitching(penyulangAwal: 'Payung')
      ..t['nama'] = ' LBS X '
      ..t['koordinat'] = '-3.1, 106.4'
      ..t['fuseRating'] = '10K'
      ..t['kodeRtu'] = 'R1'
      ..t['tahunPasang'] = '2019';
    expect(i.cek(_data.penyulang), isEmpty);
    final p = i.payload();
    expect(p['nama'], 'LBS X');
    expect(p['tahunPasang'], 2019);
    expect(p.containsKey('fuseRating'), isFalse, reason: 'bukan FCO');
    expect(p.containsKey('kodeRtu'), isFalse, reason: 'SCADA tidak dicentang');
    expect(p.containsKey('switchingId'), isFalse, reason: 'baris baru');
    expect(p['bisaTrip'], isFalse, reason: 'LBS bawaan tidak bisa trip');
    final salah = IsianSwitching()
      ..t['penyulang'] = 'ASING'
      ..t['koordinat'] = '-3.1;106'
      ..t['tahunPasang'] = '1800'
      ..t['ratingA'] = 'x'
      ..b['titikHubung'] = true;
    expect(salah.cek(_data.penyulang).keys.toSet(), {'nama', 'penyulang', 'koordinat', 'tahunPasang', 'ratingA', 'penyulangSisiB'});
  });

  test('switching: isian dari data lama mengirim switchingId + revision + aktif', () {
    final i = IsianSwitching.dari(_data.cari('SWC-0002')!)..revision = 3;
    final p = i.payload();
    expect([p['switchingId'], p['revision'], p['aktif'], p['statusVerifikasi'], p['koordinat']], ['SWC-0002', 3, true, 'PERLU_PERBAIKAN', '-3.01, 106.5']);
    expect(p['bisaTrip'], isTrue, reason: 'nilai lama ACR dipertahankan');
  });

  test('switching: ganti jenis mengikuti bawaan bisa trip sampai admin mengubahnya', () {
    final i = IsianSwitching()..gantiJenis('ACR');
    expect(i.b['bisaTrip'], isTrue);
    i.gantiJenis('LBS');
    expect(i.b['bisaTrip'], isFalse);
    i
      ..b['bisaTrip'] = true
      ..bisaTripDiubah = true
      ..gantiJenis('DS');
    expect(i.b['bisaTrip'], isTrue);
  });

  test('switching: judul Proper (huruf awal tiap kata besar), singkatan / satuan dibiarkan', () {
    expect(proper('switching aktif'), 'Switching Aktif');
    expect(proper('Bisa trip (memutus arus gangguan)'), 'Bisa Trip (Memutus Arus Gangguan)');
    expect(proper('Rating kV'), 'Rating kV');
    expect(proper('Nomor tiang (ASSETNUM)'), 'Nomor Tiang (ASSETNUM)');
    expect(proper('Kontroler & kemampuan'), 'Kontroler & Kemampuan');
    expect(proper('Rasio CT / VT'), 'Rasio CT / VT');
  });

  test('switching: label pilihan tidak mengulang jenis ("PMT" + "PMT Palas" = "PMT Palas")', () {
    expect(labelSwitching('PMT', 'PMT Palas'), 'PMT Palas');
    expect(labelSwitching('pmt', 'PMT Palas'), 'PMT Palas');
    expect(labelSwitching('LBS', 'Air Bara'), 'LBS Air Bara');
    expect(labelSwitching('ACR', ''), 'ACR');
  });

  test('switching: pilihan hulu + jarak', () {
    final i = IsianSwitching.dari(_data.cari('SWC-0001')!);
    expect(pilihanHulu(_data.switching, i).map((s) => s.id), ['SWC-0002']);
    expect(jarakMeter(-3.0, 106.0, -3.0, 106.0), 0);
    expect(jarakMeter(-3.0, 106.0, -3.001, 106.0), closeTo(111, 1));
  });
}

// Uji render form (tata letak tanpa galat overflow / unbounded), tanpa server.
Sesi _sesi() => Sesi(
      token: 't',
      profil: {'userId': 'u-admin', 'username': '16130.admin', 'nama': 'Admin', 'role': 'ADMIN'},
      menu: const [
        {'kode': 'OPS_MASTER_SWITCHING', 'aksi': 'UBAH'}
      ],
      offlineSampai: DateTime.now().add(const Duration(days: 1)),
    );

void _uiTests() {
  testWidgets('switching: form tambah + ubah tampil tanpa galat, FCO memunculkan isian fuse', (t) async {
    t.view.physicalSize = const Size(1080, 2400);
    t.view.devicePixelRatio = 2.75;
    addTearDown(t.view.reset);
    final repo = SwitchingRepository(ApiClient());
    await t.pumpWidget(MaterialApp(home: SwitchingFormScreen(sesi: _sesi(), repo: repo, data: _data, penyulangAwal: 'Payung')));
    await t.pumpAndSettle();
    expect(find.text('Tambah Switching'), findsOneWidget);
    expect(find.text('Fuse (FCO)'), findsNothing);
    await t.tap(find.text('FCO'));
    await t.pumpAndSettle();
    await t.tap(find.text('Simpan & Verifikasi'));
    await t.pump();
    expect(find.text('Nama wajib diisi.'), findsOneWidget, reason: 'cek isian sebelum kirim');
    await t.pump(const Duration(seconds: 5));
    await t.scrollUntilVisible(find.text('Fuse (FCO)'), 300, scrollable: find.byType(Scrollable).first);
    expect(find.text('Fuse (FCO)'), findsOneWidget);
    await t.pumpWidget(MaterialApp(home: SwitchingFormScreen(key: const ValueKey('ubah'), sesi: _sesi(), repo: repo, data: _data, awal: _data.cari('SWC-0002'))));
    await t.pumpAndSettle();
    expect(find.text('Ubah SWC-0002'), findsOneWidget);
    await t.scrollUntilVisible(find.text('Aktif'), 400, scrollable: find.byType(Scrollable).first);
    expect(find.text('Aktif'), findsOneWidget);
  });
}
