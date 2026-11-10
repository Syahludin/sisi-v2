import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/features/gudang/gudang_model.dart';

void main() {
  test('kunci jenis sama dengan server dan label terbaca', () {
    const j = JenisMcb(materialId: 'm1', daya: '2A', merk: 'Schneider', statusMcb: 'Baru', jumlah: 3);
    expect(j.kunci, 'm1|2A|Schneider|Baru');
    expect(j.label, '2A Schneider Baru');
    expect(const EntriMcb(daya: '2A', merk: 'Schneider', statusMcb: 'Baru').json, {'daya': '2A', 'merk': 'Schneider', 'statusMcb': 'Baru'});
  });

  test('kelompokkanEntri menjumlah per jenis dan berurut kunci', () {
    const a = EntriMcb(daya: '2A', merk: 'Schneider', statusMcb: 'Baru');
    const b = EntriMcb(daya: '4A', merk: 'Hager', statusMcb: 'Ex-Handal');
    expect(kelompokkanEntri([b, a, a]), {'2A|Schneider|Baru': 2, '4A|Hager|Ex-Handal': 1});
    expect(kelompokkanEntri(const []), isEmpty);
  });

  test('ringkasJenis dan totalJenis', () {
    final l = [
      const JenisMcb(materialId: 'm', daya: '2A', merk: 'S', statusMcb: 'Baru', jumlah: 3),
      const JenisMcb(materialId: 'm', daya: '4A', merk: 'H', statusMcb: 'Ex-Handal', jumlah: 1),
      const JenisMcb(materialId: 'm', daya: '6A', merk: 'X', statusMcb: 'Baru', jumlah: 0),
    ];
    expect(ringkasJenis(l), '3 × 2A S Baru; 1 × 4A H Ex-Handal');
    expect(totalJenis(l), 4);
    expect(ringkasJenis(const []), '-');
  });

  test('galatJumlah: bilangan bulat dalam batas', () {
    expect(galatJumlah('3'), isNull);
    expect(galatJumlah(' 12 '), isNull);
    expect(galatJumlah(''), 'Isi jumlah.');
    expect(galatJumlah('abc'), 'Jumlah harus bilangan bulat.');
    expect(galatJumlah('1.5'), 'Jumlah harus bilangan bulat.');
    expect(galatJumlah('0'), 'Jumlah minimal 1.');
    expect(galatJumlah('0', min: 0), isNull);
    expect(galatJumlah('100001'), 'Jumlah terlalu besar.');
  });

  test('cara penyelesaian selisih mengikuti arah', () {
    expect(pilihanCara('KURANG'), ['HILANG', 'SUSULAN', 'SALAH_HITUNG']);
    expect(pilihanCara('LEBIH'), ['TAMBAHAN_MASUK', 'SALAH_CATAT', 'SALAH_HITUNG']);
    expect(pilihanCara('lain'), isEmpty);
    expect(labelCara('SALAH_HITUNG'), 'Petugas salah hitung (dikembalikan)');
    expect(labelCara('TIDAK_ADA'), 'TIDAK_ADA');
  });

  test('merkMcb: daftar dari master dibaca bersih; tanpa kunci / salah bentuk = kosong', () {
    final dasar = {'shift': {'tanggal': '2026-11-03', 'no': 1}, 'pemeriksaan': null, 'saldo': [], 'bolehPakai': false};
    expect(StokYandal.dariJson({...dasar, 'merkMcb': ['Hager', ' ABB ', '', 3]}).merkMcb, ['Hager', 'ABB']);
    expect(StokYandal.dariJson(dasar).merkMcb, isEmpty);
    expect(StokYandal.dariJson({...dasar, 'merkMcb': 'Hager'}).merkMcb, isEmpty);
    expect(daftarMerk({'merkMcb': ['Schneider']}), ['Schneider']);
    expect(daftarMerk({}), isEmpty);
    expect(StokYandal.dariJson({...dasar, 'keperluanMcb': ['Pasang Baru', ' ', 5]}).keperluanMcb, ['Pasang Baru']);
    expect(StokYandal.dariJson(dasar).keperluanMcb, isEmpty);
    expect(daftarKeperluan({'keperluanMcb': 'x'}), isEmpty);
  });

  test('StokYandal.dariJson: belum diperiksa, menunggu admin dengan selisih, dikembalikan', () {
    final awal = StokYandal.dariJson({
      'shift': {'tanggal': '2026-11-03', 'no': 1},
      'pemeriksaan': null,
      'saldo': [
        {'materialId': 'm', 'daya': '2A', 'merk': 'S', 'statusMcb': 'Baru', 'jumlah': 2}
      ],
      'bolehPakai': false,
    });
    expect([awal.tanggal, awal.noShift, awal.perluPeriksa, awal.bolehPakai, awal.saldo.length], ['2026-11-03', 1, true, false, 1]);

    final menunggu = StokYandal.dariJson({
      'shift': {'tanggal': '2026-11-03', 'no': 1},
      'pemeriksaan': {
        'pemeriksaanId': 'p1',
        'status': 'MENUNGGU_ADMIN',
        'selisih': [
          {'selisihId': 's1', 'daya': '2A', 'merk': 'S', 'statusMcb': 'Baru', 'jumlahPerkiraan': 2, 'jumlahInput': 1, 'selisih': -1, 'arah': 'KURANG', 'status': 'MENUNGGU', 'caraPenyelesaian': ''},
          {'selisihId': 's2', 'daya': '6A', 'merk': 'H', 'statusMcb': 'Baru', 'jumlahPerkiraan': 0, 'jumlahInput': 1, 'selisih': 1, 'arah': 'LEBIH', 'status': 'MENUNGGU', 'caraPenyelesaian': ''},
        ],
      },
      'saldo': [],
      'bolehPakai': false,
    });
    expect([menunggu.menungguAdmin, menunggu.perluPeriksa, menunggu.selisih.length], [true, false, 2]);
    expect(menunggu.selisihKurangMenunggu.map((s) => s.selisihId), ['s1']);
    expect(menunggu.selisih.first.teks, 'Kurang 1: 2A S Baru (perkiraan 2, dihitung 1)');
    expect(menunggu.selisih.last.teks, 'Lebih 1: 6A H Baru (perkiraan 0, dihitung 1)');

    final kembali = StokYandal.dariJson({'shift': {'tanggal': '2026-11-03', 'no': 2}, 'pemeriksaan': {'pemeriksaanId': 'p1', 'status': 'DIKEMBALIKAN', 'selisih': []}, 'saldo': [], 'bolehPakai': false});
    expect(kembali.perluPeriksa, true);
  });

  test('StokGudang.dariJson: gudang, tim (izin / tanpa izin), mutasi', () {
    final s = StokGudang.dariJson({
      'gudang': [
        {'materialId': 'm', 'daya': '2A', 'merk': 'S', 'statusMcb': 'Baru', 'jumlah': 6}
      ],
      'tim': [
        {
          'timId': 't1',
          'nama': 'Yandal 13',
          'stok': [
            {'materialId': 'm', 'daya': '2A', 'merk': 'S', 'statusMcb': 'Baru', 'jumlah': 4}
          ],
          'tanpaIzin': []
        }
      ],
      'mutasi': [
        {'mutasiId': 'x', 'jenisMutasi': 'KIRIM_TIM'}
      ],
    });
    expect([s.gudang.first.jumlah, s.tim.first.nama, totalJenis(s.tim.first.stok), s.mutasi.length], [6, 'Yandal 13', 4, 1]);
  });

  ujiSusunStok();
}

void ujiSusunStok() {
  Map<String, String> f([Map<String, String> o = const {}]) =>
      {'materialId': 'm1', 'daya': ' 2 ', 'merk': 'Schneider ', 'statusMcb': 'Baru', 'jumlah': '3', ...o};

  test('susunStok tambah / kirim: rapikan teks, jumlah bulat > 0, idOperasi ikut, catatan hanya bila diisi', () {
    final t = susunStok('tambah', f(), 'ID1');
    expect(t.galat, isNull);
    expect(t.data, {'idOperasi': 'ID1', 'materialId': 'm1', 'daya': '2', 'merk': 'Schneider', 'statusMcb': 'Baru', 'jumlah': 3});
    final k = susunStok('kirim', f({'timId': 't1', 'catatan': ' dari PLN '}), 'ID1');
    expect(k.data!['timId'], 't1');
    expect(k.data!['catatan'], 'dari PLN');
    expect(susunStok('kirim', f(), 'ID1').galat, 'Pilih tim.');
    expect(susunStok('tambah', f({'jumlah': '0'}), 'ID1').galat, 'Jumlah minimal 1.');
    expect(susunStok('tambah', f({'jumlah': '1.5'}), 'ID1').galat, 'Jumlah harus bilangan bulat.');
    expect(susunStok('tambah', f({'daya': ' '}), 'ID1').galat, 'Isi daya dan merk MCB.');
    expect(susunStok('tambah', f({'statusMcb': 'Bekas'}), 'ID1').galat, 'Pilih status MCB.');
    expect(susunStok('tambah', f({'materialId': ''}), 'ID1').galat, 'Pilih material.');
  });

  test('daya: angka diberi satuan A di tampilan; tambah stok menolak daya berhuruf; kirim / tarik menerima nilai lama', () {
    expect(teksDaya('2'), '2A');
    expect(teksDaya(' 10 '), '10A');
    expect(teksDaya('2A'), '2A');
    expect(const EntriMcb(daya: '4', merk: 'Hager', statusMcb: 'Baru').label, '4A Hager Baru');
    expect(susunStok('tambah', f({'daya': '2A'}), 'ID1').galat, 'Daya harus angka (Ampere).');
    expect(susunStok('kirim', f({'daya': '2A', 'timId': 't1'}), 'ID1').galat, isNull, reason: 'jenis lama berhuruf tetap bisa dikirim / ditarik');
  });

  test('susunStok tarik / koreksi: alasan wajib; koreksi boleh nol, lokasi wajib', () {
    expect(susunStok('tarik', f({'timId': 't1'}), 'ID1').galat, 'Isi alasan.');
    final t = susunStok('tarik', f({'timId': 't1', 'alasan': 'tim bubar'}), 'ID1');
    expect(t.data!['alasan'], 'tim bubar');
    final k = susunStok('koreksi', f({'jumlahBaru': '0', 'lokasi': 'GUDANG', 'alasan': 'hitung ulang'}), 'ID1');
    expect(k.data, {'idOperasi': 'ID1', 'lokasi': 'GUDANG', 'materialId': 'm1', 'daya': '2', 'merk': 'Schneider', 'statusMcb': 'Baru', 'jumlahBaru': 0, 'alasan': 'hitung ulang'});
    expect(susunStok('koreksi', f({'jumlahBaru': '-1', 'lokasi': 'GUDANG', 'alasan': 'x'}), 'ID1').galat, 'Jumlah harus bilangan bulat.');
    expect(susunStok('koreksi', f({'jumlahBaru': '2', 'alasan': 'x'}), 'ID1').galat, 'Pilih lokasi stok.');
  });
}
