import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/features/hartek/hartek_lokal.dart';

/// v0.95.0: dokumen Hartek lokal (tanda kirim, gabung dengan server, gardu ganda).
void main() {
  Map<String, dynamic> docAwal() {
    final d = HartekLokal.kosong('2026-10-14');
    HartekLokal.buatHeader(d, {'headerId': 'h1', 'kodeHeader': '', 'revision': 1});
    HartekLokal.tandai(d, 'h1', null);
    HartekLokal.tambahPg(d, {'pgId': 'p1', 'jenisPekerjaan': 'Gardu', 'noGardu': 'TB0001'});
    HartekLokal.tambahPekerjaan(d, 'p1', {'pekerjaanId': 'k1', 'pekerjaan': 'Ganti Arrester'});
    HartekLokal.tambahAnak(d, 'material', 'k1', {'idBaris': 'm1', 'material': 'Arrester'});
    return d;
  }

  test('hitung menunggu, diterima membersihkan tanda dan mengisi kode', () {
    final d = docAwal();
    expect(HartekLokal.hitung(d).menunggu, 3);
    HartekLokal.diterima(d, 'simpanPg', 'p1', {'kodePg': 'HAR-1-GRD.001'});
    expect(HartekLokal.pg(d, 'p1')!['kodePg'], 'HAR-1-GRD.001');
    expect(HartekLokal.hitung(d).menunggu, 2);
    expect(HartekLokal.idTurunan(d, 'p1'), ['p1', 'k1', 'm1']);
  });

  test('gabung: server menang, data lokal bertanda tetap di bawah induknya', () {
    final d = docAwal();
    HartekLokal.diterima(d, 'simpanPg', 'p1', {'kodePg': 'K1'});
    final server = {
      'tanggal': '2026-10-14',
      'header': {'headerId': 'h1', 'kodeHeader': 'HAR-1', 'revision': 2},
      'objek': [
        {'pgId': 'p1', 'kodePg': 'K1', 'jenisPekerjaan': 'Gardu', 'noGardu': 'TB0001', 'pekerjaan': <dynamic>[]},
        {'pgId': 'p2', 'kodePg': 'K2', 'jenisPekerjaan': 'Jaringan', 'pekerjaan': <dynamic>[]},
      ],
    };
    final g = HartekLokal.gabung(d, server);
    expect(g['header']['kodeHeader'], 'HAR-1');
    expect(HartekLokal.daftar(g['objek']).length, 2);
    expect(HartekLokal.pekerjaan(g, 'k1'), isNotNull, reason: 'pekerjaan lokal belum terkirim tidak hilang');
  });

  test('gardu ganda: hanya pasangan Gardu + Non - Teknik', () {
    final d = docAwal();
    expect(HartekLokal.garduGanda(d, 'tb0001', 'Gardu'), isTrue);
    expect(HartekLokal.garduGanda(d, 'TB0001', 'Non - Teknik'), isFalse);
    expect(HartekLokal.garduGanda(d, 'TB0002', 'Gardu'), isFalse);
  });

  test('buang menghapus node + turunannya', () {
    final d = docAwal();
    HartekLokal.buang(d, 'k1');
    expect(HartekLokal.pekerjaan(d, 'k1'), isNull);
    expect(HartekLokal.pg(d, 'p1'), isNotNull);
  });

  test('v0.97.0: ubahIsianPekerjaan menandai _ubah dan dipertahankan saat gabung dengan server', () {
    final d = docAwal();
    HartekLokal.diterima(d, 'simpanPg', 'p1', {'kodePg': 'K1'});
    HartekLokal.diterima(d, 'simpanPekerjaan', 'k1', {'kodePekerjaan': 'K1-PKJ.001'});
    HartekLokal.diterima(d, 'simpanMaterial', 'm1', {'kodeMaterial': 'K1-PKJ.001-MAT.001'});
    expect(HartekLokal.hitung(d).menunggu, 0);
    HartekLokal.ubahIsianPekerjaan(d, 'k1', {'pekerjaan': 'Pemerataan Beban Gardu', 'jenisId': 'jh1', 'jumlahPekerjaan': 5, 'satuanPekerjaan': 'unit'}, tandaiUbah: true);
    expect(HartekLokal.hitung(d).menunggu, 1);
    final server = {
      'tanggal': '2026-10-14',
      'header': {'headerId': 'h1', 'kodeHeader': 'HAR-1', 'revision': 1},
      'objek': [
        {
          'pgId': 'p1',
          'kodePg': 'K1',
          'jenisPekerjaan': 'Gardu',
          'noGardu': 'TB0001',
          'pekerjaan': [
            {'pekerjaanId': 'k1', 'kodePekerjaan': 'K1-PKJ.001', 'pekerjaan': 'Ganti Arrester', 'jumlahPekerjaan': 1, 'revision': 2, 'material': <dynamic>[], 'grounding': <dynamic>[], 'pemerataan': <dynamic>[]},
          ],
        },
      ],
    };
    final g = HartekLokal.gabung(d, server);
    final pk = HartekLokal.pekerjaan(g, 'k1')!;
    expect(pk['pekerjaan'], 'Pemerataan Beban Gardu', reason: 'perubahan nama pekerjaan lokal tetap tampil');
    expect(pk['jumlahPekerjaan'], 5, reason: 'perubahan jumlah lokal belum terkirim tetap tampil');
    expect(pk['revision'], 2, reason: 'revision mengikuti server');
    HartekLokal.tandaiUbahNode(g, 'k1', null);
    expect(HartekLokal.hitung(g).menunggu, 0);
  });

  test('v1.0.0: foto rincian menunggu / ditolak / diterima, dihitung, dan bertahan saat gabung dengan server', () {
    final d = docAwal();
    HartekLokal.tambahAnak(d, 'grounding', 'k1', {'idBaris': 'g1', 'kodeGrounding': ''});
    expect(HartekLokal.induk('uploadFoto', {'idBaris': 'g1'}), 'g1');
    expect(HartekLokal.aksiBuat('uploadFoto'), isFalse);
    expect(HartekLokal.endpoint['uploadFoto'], 'uploadFotoHartek');
    final awal = HartekLokal.hitung(d).menunggu;
    expect(HartekLokal.tambahFoto(d, 'g1', 'SEBELUM', '/hp/a.jpg'), isTrue);
    expect(HartekLokal.tambahFoto(d, 'g1', 'SESUDAH', '/hp/b.jpg'), isTrue);
    expect(HartekLokal.hitung(d).menunggu, awal + 2);
    HartekLokal.tandaiFoto(d, 'g1', 'SEBELUM', HartekLokal.gagal, pesan: 'ditolak');
    final g = HartekLokal.cari(d, 'g1')!;
    expect(HartekLokal.statusFoto(g, 'SEBELUM'), HartekLokal.gagal);
    expect(HartekLokal.galatFoto(g, 'SEBELUM'), 'ditolak');
    expect(HartekLokal.hitung(d).gagal, 1);
    HartekLokal.tandaiFoto(d, 'g1', 'SESUDAH', null, link: 'https://drive/b');
    expect(HartekLokal.statusFoto(HartekLokal.cari(d, 'g1')!, 'SESUDAH'), isNull);
    expect(HartekLokal.fotoDiServer(HartekLokal.cari(d, 'g1')!)['SESUDAH'], 'https://drive/b');
    expect(HartekLokal.fotoDiHp(HartekLokal.cari(d, 'g1')!)['SESUDAH'], '/hp/b.jpg', reason: 'file HP tetap untuk dilihat');
    // semua node sudah diterima server, foto SEBELUM masih ditolak: tetap ada sesudah gabung
    for (final id in ['h1', 'p1', 'k1', 'm1', 'g1']) {
      HartekLokal.tandai(d, id, null);
    }
    final server = {
      'tanggal': '2026-10-14',
      'header': {'headerId': 'h1', 'kodeHeader': 'HAR-1', 'revision': 1},
      'objek': [
        {
          'pgId': 'p1',
          'pekerjaan': [
            {
              'pekerjaanId': 'k1',
              'material': [],
              'grounding': [
                {'idBaris': 'g1', 'kodeGrounding': 'G1', 'foto': {'SESUDAH': 'https://drive/b'}}
              ],
              'pemerataan': [],
            }
          ],
        }
      ],
    };
    final hasil = HartekLokal.gabung(d, server);
    final gg = HartekLokal.cari(hasil, 'g1')!;
    expect(gg['kodeGrounding'], 'G1');
    expect(HartekLokal.statusFoto(gg, 'SEBELUM'), HartekLokal.gagal);
    expect(HartekLokal.fotoDiHp(gg)['SEBELUM'], '/hp/a.jpg');
    expect(HartekLokal.hitung(hasil).gagal, 1);
    expect(HartekLokal.buangFoto(hasil, 'g1', 'SEBELUM'), '/hp/a.jpg');
    expect(HartekLokal.hitung(hasil).gagal, 0);
  });

  test('v1.0.2: slot foto wajib (pasang grounding = sesudah saja) dan hitung rincian yang fotonya belum lengkap', () {
    final d = docAwal();
    HartekLokal.tambahAnak(d, 'grounding', 'k1', {'idBaris': 'g1', 'hasilSebelum': 5, 'hasilSesudah': 2});
    HartekLokal.tambahAnak(d, 'grounding', 'k1', {'idBaris': 'g2', 'hasilSebelum': '', 'hasilSesudah': 2});
    HartekLokal.tambahAnak(d, 'pemerataan', 'k1', {'idBaris': 'pm1'});
    expect(HartekLokal.slotWajib('grounding', HartekLokal.cari(d, 'g1')!), ['SEBELUM', 'SESUDAH']);
    expect(HartekLokal.slotWajib('grounding', HartekLokal.cari(d, 'g2')!), ['SESUDAH']);
    expect(HartekLokal.slotWajib('material', HartekLokal.cari(d, 'm1')!), isEmpty);
    expect(HartekLokal.rincianFotoKurang(d), 3);
    HartekLokal.tambahFoto(d, 'g2', 'SESUDAH', '/hp/a.jpg');
    HartekLokal.tambahFoto(d, 'g1', 'SEBELUM', '/hp/b.jpg');
    HartekLokal.tambahFoto(d, 'g1', 'SESUDAH', '/hp/c.jpg');
    HartekLokal.tandaiFoto(d, 'g1', 'SESUDAH', null, link: 'https://drive/c');
    expect(HartekLokal.rincianFotoKurang(d), 1, reason: 'tinggal pemerataan');
    for (final s in HartekLokal.slotFoto['pemerataan']!) {
      HartekLokal.tambahFoto(d, 'pm1', s, '/hp/$s.jpg');
    }
    expect(HartekLokal.rincianFotoKurang(d), 0);
  });
}

