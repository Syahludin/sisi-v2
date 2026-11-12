import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/core/api_client.dart';
import 'package:sisi_row/core/sesi.dart';
import 'package:sisi_row/features/hartek/hartek_store.dart' show GudangHartek;
import 'package:sisi_row/features/switching/switching_model.dart' show JaringanSwitching;
import 'package:sisi_row/features/tiang/draf_tiang.dart';
import 'package:sisi_row/features/tiang/segmen_screen.dart';
import 'package:sisi_row/features/tiang/tiang_api.dart';
import 'package:sisi_row/features/tiang/tiang_form_screen.dart';
import 'package:sisi_row/features/tiang/tiang_model.dart';
import 'package:sisi_row/features/tiang/tiang_repository.dart';
import 'package:sisi_row/features/tiang/tiket_tiang.dart';

/// Gudang master palsu: hanya dibaca / ditulis DrafTiang.
class _GudangUji implements GudangHartek {
  final Map<String, String> isi = {};
  @override
  Future<({String json, DateTime diambil})?> bacaMaster(String kunci) async => isi[kunci] == null ? null : (json: isi[kunci]!, diambil: DateTime.now());
  @override
  Future<void> tulisMaster(String kunci, String json) async => isi[kunci] = json;
  @override
  dynamic noSuchMethod(Invocation i) => throw UnimplementedError('${i.memberName}');
}

Tiang _t(String id, String nama, String induk, {String status = 'BELUM', Map<String, dynamic> sirkuit = const {}}) => Tiang({
      'tiangId': id, 'nama': nama, 'kode': 'PLS', 'statusVerifikasi': status, 'revision': 1, 'latAset': -3.0, 'lngAset': 106.5,
      'sirkuit': [{'sirkuitId': 's$id', 'indukTiangId': induk, ...sirkuit}],
    });

final _pilihan = PilihanTiang.dariJson({
  'jalur': [{'kode': 'PLS', 'jumlah': 4, 'terverifikasi': 1}],
  'konstruksi': [{'konstruksiId': 'k1', 'kode': 'TM1'}],
  'ukuran': ['11 Meter 350 daN', ' ', '13 Meter 500 daN'],
  'jaringan': [{'sectionId': 's1', 'penyulang': 'TOBOALI 1', 'section': 'PMT TOBOALI 1'}, {'sectionId': 's3', 'penyulang': 'PAYUNG', 'section': 'PMT PAYUNG'}],
  'segmen': [{'segmenId': 'SGM-0001', 'nama': 'LBS A - TB01', 'penyulang': 'TOBOALI 1', 'sectionId': 's1'}],
  'switching': [{'switchingId': 'SWC-0001', 'jenis': 'LBS', 'nama': 'LBS A', 'penyulang': 'TOBOALI 1'}],
});

void main() {
  test('tiang: ukuran dari db_Ukuran_Tiang; kosong = daftar bawaan', () {
    expect(_pilihan.pilihanUkuran, ['11 Meter 350 daN', '13 Meter 500 daN']);
    expect(PilihanTiang.dariJson({}).pilihanUkuran, ukuranTiang);
  });
  test('tiang: urutan jalur = induk lalu anak; jalur utama sejajar, cabang menjorok; tiang berikutnya yang belum', () {
    final daftar = [
      _t('3', 'PLS0003', '2', status: 'TERVERIFIKASI'), _t('1', 'PLS0001', ''), _t('2', 'PLS0002', '1', status: 'TERVERIFIKASI'),
      _t('5', 'PLS0002.C0001', '2'), _t('4', 'PLS0004', '3', status: 'TIDAK_DITEMUKAN'), _t('9', 'PLS0009', 'luar-jalur'),
    ];
    final u = urutanJalur(daftar);
    expect([for (final b in u) '${b.tiang.id}:${b.dalam}${b.cabang ? 'c' : ''}'], ['1:0', '2:0', '5:1c', '3:0', '4:0', '9:0']);
    expect(berikutnya(u, '2')?.id, '5', reason: 'cabang di bawah tiang 2 dulu');
    expect(berikutnya(u, '5')?.id, '9', reason: '3 dan 4 sudah selesai');
    expect(berikutnya(u, '9'), isNull);
    expect(urutanJalur([_t('a', 'A', 'b'), _t('b', 'B', 'a')]).length, 2, reason: 'putaran data tetap tampil sekali');
  });

  test('tiang: isian = sirkuit kosong diusulkan dari tiang sebelumnya (induk tetap), payload rapi, cek wajib', () {
    final contoh = [IsianSirkuit.dari(Sirkuit({'sirkuitId': 'x', 'penyulang': 'TOBOALI 1', 'segmenId': 'SGM-0001', 'jenisKabel': 'AAAC', 'ukuranMm2': 150, 'switchingDiTiang': 'SWC-0001'}))];
    final i = IsianTiang(_t('2', 'PLS0002', '1'), contoh: contoh);
    expect([i.sirkuit.first.id, i.sirkuit.first.t['penyulang'], i.sirkuit.first.t['indukTiangId'], i.sirkuit.first.t['switchingDiTiang'], i.sirkuit.first.ukuranMm2],
        ['s2', 'TOBOALI 1', '1', '', 150]);
    expect(i.cek(_pilihan.penyulang).keys.toSet(), {'status', 'koordinat', 'foto', 'jenis', 'ukuran', 'sisi', 'sirkuit0'}, reason: 'status belum dipilih + semua isian wajib kosong');
    i.status = 'PERLU_PERBAIKAN';
    expect(i.cek(_pilihan.penyulang).keys.toSet(), {'koordinat', 'foto', 'jenis', 'ukuran', 'sisi', 'sirkuit0'}, reason: 'Perlu Perbaikan juga wajib lengkap');
    i.status = 'TIDAK_DITEMUKAN';
    expect(i.cek(_pilihan.penyulang), isEmpty, reason: 'Tidak Ditemukan hanya butuh status');
    i.status = 'TERVERIFIKASI';
    i
      ..koordinat = '-3.0001, 106.5005'
      ..akurasiM = 4.26
      ..jenis = 'BETON'
      ..aturJumlahSirkuit(2);
    i.sirkuit[1].t['penyulang'] = 'PAYUNG';
    final p = i.payload();
    expect([p['tiangId'], p['revision'], p['statusVerifikasi'], p['akurasiM'], (p['sirkuit'] as List).length], ['2', 1, 'TERVERIFIKASI', 4.3, 2]);
    expect((p['sirkuit'] as List)[1].containsKey('sirkuitId'), isFalse, reason: 'sirkuit kedua baru');
    i.status = 'TIDAK_DITEMUKAN';
    expect(i.payload().keys.toSet(), {'tiangId', 'revision', 'statusVerifikasi'});
    final baru = IsianTiang(null, kode: 'PLS');
    expect(baru.cek(_pilihan.penyulang).keys.toSet(), {'status', 'nama', 'koordinat', 'foto', 'jenis', 'ukuran', 'sisi', 'sirkuit0'});
    baru.nama = 'PLS0003A';
    expect(baru.payload()['kode'], 'PLS');
  });

  test('tiang: Terverifikasi butuh data wajib, induk dikonfirmasi (Benar / Diganti / Tiang Awal SKTM), switching atau keterangannya', () {
    final i = IsianTiang(_t('2', 'PLS0002', '1'));
    i
      ..koordinat = '-3.0001, 106.5005'
      ..jenis = 'BETON'
      ..ukuran = '12 Meter 200 daN'
      ..sisiJalan = 'KIRI';
    final s = i.sirkuit.first;
    s.t.addAll({'penyulang': 'TOBOALI 1', 'sectionId': 's1', 'segmenId': 'SGM-0001', 'konstruksiId': 'k1', 'peranTitik': 'biasa', 'jenisKabel': 'AAAC'});
    s.ukuranMm2 = 150;
    final foto = {'TIANG', 'KEPALA'};
    expect(i.kurang({'TIANG'}), ['Foto Konstruksi SUTM', 'Konfirmasi Tiang Hulu', 'Switching Hulu atau Keterangan Tanpa Switching']);
    // induk usulan tetap = harus dikonfirmasi; pilih lain = Diganti otomatis; kembali ke usulan = belum
    expect(s.t['indukTiangId'], '1');
    s.pilihInduk('5');
    expect([s.t['indukStatus'], s.t['indukTiangId']], ['DIGANTI', '5']);
    s.pilihInduk('1');
    expect(s.t['indukStatus'], '');
    s.t['indukStatus'] = 'BENAR';
    s.pilihSwitching('');
    expect(s.t['switchingKeterangan'], ketTanpaSwitching);
    expect(i.kurang(foto), isEmpty);
    i.dasarKoordinat = 'LAPANGAN';
    i.status = 'TERVERIFIKASI';
    expect(i.cek(_pilihan.penyulang, foto), isEmpty);
    s.pilihSwitching('SWC-0001');
    expect([s.t['switchingKeterangan'], i.kurang(foto)], ['', isEmpty]);
    // Tiang Awal SKTM: tanpa induk tiang, keterangan wajib
    s.jadikanTiangAwal();
    expect([s.t['indukTiangId'], s.t['indukStatus'], s.t['indukKeterangan']], ['', 'TITIK_AWAL', ketTitikAwal]);
    expect(i.kurang(foto), isEmpty);
    s.t['indukKeterangan'] = ' ';
    expect(i.kurang(foto), ['Keterangan Tiang Awal SKTM']);
    final p = (i.payload()['sirkuit'] as List).first as Map;
    expect([p['indukStatus'], p.containsKey('indukTiangId')], ['TITIK_AWAL', false]);
  });

  test('tiang: penyulang ganda = posisi Atas / Tengah / Bawah tanpa kembar, konstruksi per penyulang, sisi jalan satu per tiang', () {
    final i = IsianTiang(_t('2', 'PLS0002', '1'));
    i.sirkuit.first.t['konstruksiId'] = 'k1';
    expect(i.sirkuit.first.t['posisi'], 'ATAS', reason: 'penyulang tunggal selalu Atas');
    i.aturJumlahSirkuit(3);
    expect(i.sirkuit.map((s) => s.t['posisi']).toList(), ['ATAS', 'BAWAH', 'TENGAH']);
    expect(i.sirkuit[1].t['konstruksiId'], 'k1', reason: 'penyulang baru menyalin konstruksi pertama, lalu bisa diubah');
    i.sirkuit[1].t['konstruksiId'] = 'k2';
    expect((i.payload()['sirkuit'] as List).map((s) => (s as Map)['konstruksiId']).toList(), ['k1', 'k2', 'k1']);
    expect(i.posisiTerpakai(1), {'ATAS', 'TENGAH'});
    i.sirkuit[2].t['posisi'] = 'BAWAH';
    expect(i.cek(const []).containsKey('posisi'), isTrue);
    i.sirkuit[2].t['posisi'] = '';
    expect(i.sirkuit[2].kurang(2, true), contains('Penyulang 3: Posisi'));
    i.aturJumlahSirkuit(1);
    expect([i.sirkuit.length, i.sirkuit.first.t['posisi']], [1, 'ATAS']);
    expect(i.kurang({'TIANG', 'KEPALA'}), contains('Sisi Jalan'));
    expect(i.payload().containsKey('sisiJalan'), isFalse);
    i.sisiJalan = 'KANAN';
    expect(i.payload()['sisiJalan'], 'KANAN');
    // posisi lama (Kiri / Kanan) dikosongkan agar dipilih ulang; penyulang tunggal tetap Atas
    final lama = IsianTiang(_t('3', 'PLS0003', '2', sirkuit: {'posisi': 'KIRI'}));
    expect(lama.sirkuit.first.t['posisi'], 'ATAS');
    final lama2 = IsianSirkuit.dari(Sirkuit({'posisi': 'KANAN'}));
    expect(lama2.t['posisi'], '');
  });

  test('tiang: hijau hanya bila Terverifikasi dan tidak ada kekurangan; foto terkirim menggugurkan kekurangannya', () {
    Tiang t(Map<String, dynamic> d) => Tiang({'tiangId': '2', 'nama': 'PLS0002', 'sirkuit': [], ...d});
    expect(t({'statusVerifikasi': 'TERVERIFIKASI'}).statusTampil, 'TERVERIFIKASI');
    final kurang = t({'statusVerifikasi': 'TERVERIFIKASI', 'foto': {}, 'kurang': ['Jenis Tiang', 'Foto Full Tiang', 'Foto Konstruksi SUTM']});
    expect([kurang.statusTampil, kurang.selesai, infoStatusTiang(kurang.statusTampil).$1], ['PERLU_DILENGKAPI', false, 'Perlu Dilengkapi']);
    final foto = t({'statusVerifikasi': 'TERVERIFIKASI', 'foto': {}, 'kurang': ['Foto Full Tiang', 'Foto Konstruksi SUTM']}).denganFoto({'TIANG', 'KEPALA'});
    expect([foto.statusTampil, foto.selesai, foto.adaFoto('TIANG')], ['TERVERIFIKASI', true, true]);
    expect(t({'statusVerifikasi': 'PERLU_PERBAIKAN', 'kurang': ['x']}).statusTampil, 'PERLU_PERBAIKAN');
  });

  test('tiang: selisih GPS dari koordinat terdaftar > 10 m wajib memilih dasar koordinat', () {
    final i = IsianTiang(_t('2', 'PLS0002', '1'));
    i.koordinat = '-3.00005, 106.5';
    expect([i.selisihM!.round(), i.perluDasar], [6, false]);
    expect(i.payload().containsKey('dasarKoordinat'), isFalse);
    i.koordinat = '-3.0001, 106.5';
    expect([i.selisihM!.round(), i.perluDasar], [11, true]);
    expect(i.cek(_pilihan.penyulang).containsKey('dasar'), isTrue);
    i.dasarKoordinat = 'TERDAFTAR';
    expect(i.cek(_pilihan.penyulang).containsKey('dasar'), isFalse);
    expect(i.payload()['dasarKoordinat'], 'TERDAFTAR');
    i.koordinat = '-3.00005, 106.5';
    expect(i.payload().containsKey('dasarKoordinat'), isFalse, reason: 'kembali dalam toleransi: dasar tidak dikirim');
    expect(IsianTiang(null, kode: 'PLS').perluDasar, isFalse, reason: 'tiang baru tidak punya koordinat terdaftar');
  });

  test('tiang: pilihan dasar koordinat tidak tereset saat koordinat berubah (GPS ulang / ketik / peta); dibuang hanya bila kembali dalam batas', () {
    final i = IsianTiang(_t('2', 'PLS0002', '1'));
    i.setKoordinat('-3.0001, 106.5', akurasiM: 5);
    i.dasarKoordinat = 'LAPANGAN';
    i.setKoordinat('-3.00012, 106.5', akurasiM: 4);
    expect([i.dasarKoordinat, i.akurasiM], ['LAPANGAN', 4], reason: 'GPS kedua masih > 10 m: pilihan bertahan');
    i.setKoordinat('-3.00015, 106.5');
    expect(i.dasarKoordinat, 'LAPANGAN', reason: 'diketik ulang');
    i.setKoordinat('-3.0002, 106.5', sumber: 'PETA');
    expect([i.dasarKoordinat, i.sumberKoordinat, i.akurasiM], ['LAPANGAN', 'PETA', null], reason: 'dipilih di peta');
    i.setKoordinat('-3.00005, 106.5');
    expect(i.dasarKoordinat, '', reason: 'dalam batas: dasar dibuang');
    i.setKoordinat('-3.0001, 106.5');
    expect([i.perluDasar, i.dasarKoordinat], [true, ''], reason: 'naik lagi > 10 m: diminta lagi');
  });

  test('segmen: payload + cek', () {
    final i = IsianSegmen();
    expect(i.cek(['TOBOALI 1']).keys.toSet(), {'nama', 'penyulang', 'sectionId', 'awalNama', 'akhirNama'});
    i.t.addAll({'nama': 'A - B', 'penyulang': 'TOBOALI 1', 'sectionId': 's1', 'awalNama': 'LBS A', 'akhirNama': 'TB01'});
    i.urutan = 'x';
    expect(i.cek(['TOBOALI 1']).keys, ['urutan']);
    i.urutan = '30';
    expect(i.payload(), {'nama': 'A - B', 'jenisSegmen': 'UDARA', 'penyulang': 'TOBOALI 1', 'sectionId': 's1', 'awalJenis': 'SWITCHING', 'awalNama': 'LBS A', 'akhirJenis': 'GARDU', 'akhirNama': 'TB01', 'urutan': 30});
    final ubah = IsianSegmen(Segmen({'segmenId': 'SGM-0002', 'revision': 3, 'aktif': true, 'nama': 'X'}))..aktif = false;
    expect([ubah.payload()['segmenId'], ubah.payload()['revision'], ubah.payload()['aktif']], ['SGM-0002', 3, false]);
  });

  Sesi sesi() => Sesi(
      token: 't',
      profil: {'userId': 'u', 'username': 'a', 'nama': 'Admin', 'role': 'ADMIN'},
      menu: const [{'kode': 'OPS_VERIFIKASI_TIANG', 'aksi': 'UBAH'}],
      offlineSampai: DateTime.now().add(const Duration(days: 1)));

  testWidgets('tiang: form verifikasi + form segmen tampil tanpa galat tata letak', (t) async {
    t.view.physicalSize = const Size(1080, 2400);
    t.view.devicePixelRatio = 2.75;
    addTearDown(t.view.reset);
    // form kini dibangun penuh (bukan lazy): atribusi peta kecil memakai font uji yang lebar, jadi teks diperkecil agar tidak meluap
    t.platformDispatcher.textScaleFactorTestValue = 0.5;
    addTearDown(t.platformDispatcher.clearAllTestValues);
    final api = TiangApi(alamat: () => '', tiket: TiketTiang((s) async => throw ApiException('X')), lama: ApiClient());
    final repo = TiangRepository(api, draf: DrafTiang(_GudangUji(), api));
    final tiang = _t('2', 'PLS0002', '1', sirkuit: {'tandaCekGawang': 'gawang_panjang', 'segmenAset': 'SEGMEN A - B', 'gawangM': 160});
    await t.pumpWidget(MaterialApp(home: TiangFormScreen(sesi: sesi(), repo: repo, pilihan: _pilihan, kode: 'PLS', tiang: tiang)));
    await t.pumpAndSettle();
    expect(find.text('Gawang panjang'), findsOneWidget);
    expect(find.text('Hasil Verifikasi *'), findsOneWidget);
    await t.tap(find.text('Simpan Verifikasi'));
    await t.pump();
    await t.pump(const Duration(seconds: 4));
    await t.tap(find.text('Tidak Ditemukan'));
    await t.pumpAndSettle();
    expect(find.textContaining('Hanya status yang dicatat'), findsOneWidget);
    await t.pumpWidget(MaterialApp(
        home: SegmenFormScreen(
            key: const ValueKey('sg'),
            sesi: sesi(),
            repo: repo,
            isian: IsianSegmen(),
            jaringan: const [JaringanSwitching('s1', 'TOBOALI 1', 'PMT TOBOALI 1')],
            switching: const [{'switchingId': 'SWC-0001', 'jenis': 'LBS', 'nama': 'LBS A', 'penyulang': 'TOBOALI 1'}],
            segmen: const [])));
    await t.pumpAndSettle();
    expect(find.text('Switching Awal'), findsOneWidget, reason: 'jenis awal SWITCHING memunculkan pilihan switching');
  });
  test('segmen kabel tanah: data kabel hanya dikirim bila KABEL_TANAH, koma desimal diterima, status kurang terbaca', () {
    final i = IsianSegmen()
      ..t['nama'] = 'PMT A - SKTM A'
      ..t['penyulang'] = 'TOBOALI 1'
      ..t['sectionId'] = 's1'
      ..t['awalNama'] = 'PMT A'
      ..t['akhirJenis'] = 'UJUNG_KABEL'
      ..t['akhirNama'] = 'SKTM A'
      ..t['jenisKabel'] = 'N2XSEBY - 1 CORE'
      ..t['ukuranMm2'] = '240'
      ..t['panjangKabelM'] = '212,5';
    expect(i.t['jenisSegmen'], 'UDARA');
    expect(i.payload().keys.where((k) => k == 'jenisKabel' || k == 'ukuranMm2' || k == 'panjangKabelM'), isEmpty, reason: 'udara tidak mengirim data kabel');
    i.t['jenisSegmen'] = 'KABEL_TANAH';
    expect(i.cek(['TOBOALI 1']), isEmpty);
    final p = i.payload();
    expect([p['jenisSegmen'], p['jenisKabel'], p['ukuranMm2'], p['panjangKabelM'], p['akhirJenis']], ['KABEL_TANAH', 'N2XSEBY - 1 CORE', 240.0, 212.5, 'UJUNG_KABEL']);
    i.t['ukuranMm2'] = 'x';
    i.t['panjangKabelM'] = '0';
    expect(i.cek(['TOBOALI 1']).keys.toSet(), {'ukuranMm2', 'panjangKabelM'});
    i.t['ukuranMm2'] = '';
    i.t['panjangKabelM'] = '';
    i.t['jenisKabel'] = '';
    expect(i.cek(['TOBOALI 1']), isEmpty, reason: 'data kabel belum lengkap tetap boleh disimpan');

    final s = Segmen({'segmenId': 'SGM-0002', 'jenisSegmen': 'KABEL_TANAH', 'statusData': 'KURANG', 'revision': 1, 'aktif': true});
    expect([s.kabelTanah, s.dataKabelKurang], [true, true]);
    expect(Segmen({'segmenId': 'SGM-0003'}).kabelTanah, isFalse);
    expect(IsianSegmen(Segmen({'segmenId': 'SGM-0003', 'revision': 1})).t['jenisSegmen'], 'UDARA');
  });

  test('tiang: titik dari peta dikirim sebagai sumberKoordinat PETA tanpa akurasi; GPS / diketik tidak mengirim sumber', () {
    final i = IsianTiang(_t('2', 'PLS0002', '1'))
      ..koordinat = '-3.000000, 106.500000'
      ..akurasiM = 4.2;
    expect(i.payload().containsKey('sumberKoordinat'), isFalse);
    i
      ..sumberKoordinat = 'PETA'
      ..akurasiM = null;
    final p = i.payload();
    expect([p['sumberKoordinat'], p.containsKey('akurasiM')], ['PETA', isFalse]);
  });

  test('tiang: kolom wajib penyulang yang kosong ditandai per kunci; posisi hanya wajib bila ganda', () {
    final s = IsianSirkuit();
    expect(s.kunciKosong(false), {'penyulang', 'sectionId', 'segmenId', 'konstruksiId', 'peranTitik', 'jenisKabel', 'ukuranMm2', 'induk', 'switching'});
    expect(s.kunciKosong(true).contains('posisi'), isTrue);
    s.t.addAll({'penyulang': 'TOBOALI 1', 'sectionId': 's1', 'segmenId': 'SGM-0001', 'konstruksiId': 'k1', 'peranTitik': 'biasa', 'jenisKabel': 'AAAC'});
    s
      ..ukuranMm2 = 150
      ..jadikanTiangAwal()
      ..pilihSwitching('');
    expect(s.kunciKosong(false), isEmpty);
  });

  test('tiang: foto terkirim menggugurkan kekurangan, juga untuk nama foto lama di cache HP', () {
    final lama = _t('2', 'PLS0002', '1', status: 'TERVERIFIKASI');
    final t = Tiang({...lama.d, 'foto': {}, 'kurang': ['Foto Tiang Utuh', 'Foto Konstruksi SUTM']});
    expect(t.denganFoto({'TIANG', 'KEPALA'}).kurang, isEmpty);
  });
}
