import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/features/hartek/hartek_lokal.dart';
import 'package:sisi_row/features/insjar/insjar_form.dart';
import 'package:sisi_row/features/insjar/insjar_lokal.dart';

/// v1.0.0: dokumen Inspeksi Jaringan lokal (header > penyulang utama > temuan + foto), gabung server, teks WA.
void main() {
  Map<String, dynamic> docAwal() {
    final d = InsJarLokal.kosong('2026-10-19');
    InsJarLokal.buatHeader(d, {'headerId': 'h1', 'kodeHeader': '', 'revision': 1});
    InsJarLokal.tambahRealisasi(d, {'realisasiId': 'r1', 'penyulang': 'PNY-A', 'tier': 'Tier 1', 'section': 'SEC-1', 'totalTiang': 12});
    InsJarLokal.tambahTemuan(d, 'r1', {'temuanId': 't1', 'jenisTemuan': 'Isolator retak', 'section': 'SEC-1'});
    return d;
  }

  test('induk antrean, hitung menunggu, diterima mengisi kode', () {
    final d = docAwal();
    expect(InsJarLokal.induk('simpanRealisasi', {'headerId': 'h1'}), 'h1');
    expect(InsJarLokal.induk('simpanTemuan', {'realisasiId': 'r1'}), 'r1');
    expect(InsJarLokal.induk('uploadFoto', {'temuanId': 't1'}), 't1');
    expect(InsJarLokal.aksiBuat('ubahRealisasi'), isFalse);
    expect(InsJarLokal.aksiBuat('uploadFoto'), isFalse);
    expect(InsJarLokal.hitung(d).menunggu, 3);
    InsJarLokal.diterima(d, 'buatHeader', 'h1', {'kodeHeader': 'IJR-1'});
    InsJarLokal.diterima(d, 'simpanRealisasi', 'r1', {'kodeRealisasi': 'IJR-1-PNY.001'});
    expect(InsJarLokal.realisasi(d, 'r1')!['kodeRealisasi'], 'IJR-1-PNY.001');
    expect(InsJarLokal.hitung(d).menunggu, 1);
    expect(InsJarLokal.idTurunan(d, 'h1'), ['h1', 'r1', 't1']);
    expect(InsJarLokal.jumlahTemuan(d), 1);
    expect(InsJarLokal.totalTiang(d), 12);
  });

  test('penyulang + tier ganda ditolak di HP, tier lain boleh', () {
    final d = docAwal();
    expect(InsJarLokal.realisasiGanda(d, 'PNY-A', 'Tier 1', 'SEC-1'), isTrue);
    expect(InsJarLokal.realisasiGanda(d, 'PNY-A', 'Tier 1', 'SEC-2'), isFalse, reason: 'v1.0.5: section lain boleh');
    expect(InsJarLokal.realisasiGanda(d, 'PNY-A', 'Tier 2', 'SEC-1'), isFalse);
    expect(InsJarLokal.realisasiGanda(d, 'PNY-A', 'Tier 1', 'SEC-1', kecuali: 'r1'), isFalse);
  });

  test('foto temuan: menunggu, ditolak, diterima; bertahan saat gabung dengan server', () {
    final d = docAwal();
    for (final id in ['h1', 'r1', 't1']) {
      InsJarLokal.tandai(d, id, null);
    }
    InsJarLokal.tambahFoto(d, 't1', 'TEMUAN', '/hp/t.jpg');
    InsJarLokal.tambahFoto(d, 't1', 'TIANG', '/hp/g.jpg');
    expect(InsJarLokal.hitung(d).menunggu, 2);
    InsJarLokal.tandaiFoto(d, 't1', 'TEMUAN', null, link: 'https://drive/t');
    InsJarLokal.tandaiFoto(d, 't1', 'TIANG', InsJarLokal.gagal, pesan: 'ditolak');
    final server = {
      'tanggal': '2026-10-19',
      'header': {'headerId': 'h1', 'kodeHeader': 'IJR-1', 'revision': 1},
      'realisasi': [
        {
          'realisasiId': 'r1',
          'kodeRealisasi': 'IJR-1-PNY.001',
          'penyulang': 'PNY-A',
          'tier': 'Tier 1',
          'revision': 1,
          'temuan': [
            {'temuanId': 't1', 'kodeTemuan': 'IJR-1-PNY.001-TJR.001', 'foto': {'TEMUAN': 'https://drive/t'}}
          ],
        }
      ],
    };
    final g = InsJarLokal.gabung(d, server);
    final t = InsJarLokal.temuan(g, 't1')!;
    expect(t['kodeTemuan'], 'IJR-1-PNY.001-TJR.001');
    expect(HartekLokal.fotoDiServer(t)['TEMUAN'], 'https://drive/t');
    expect(HartekLokal.statusFoto(t, 'TIANG'), HartekLokal.gagal);
    expect(HartekLokal.fotoDiHp(t)['TIANG'], '/hp/g.jpg');
    expect(InsJarLokal.hitung(g).gagal, 1);
    expect(InsJarLokal.buangFoto(g, 't1', 'TIANG'), '/hp/g.jpg');
    expect(InsJarLokal.hitung(g).gagal, 0);
  });

  test('perubahan penyulang utama yang belum terkirim tetap tampil saat gabung', () {
    final d = docAwal();
    for (final id in ['h1', 'r1', 't1']) {
      InsJarLokal.tandai(d, id, null);
    }
    InsJarLokal.ubahIsianRealisasi(d, 'r1', {'totalTiang': 20}, tandaiUbah: true);
    final server = {
      'tanggal': '2026-10-19',
      'header': {'headerId': 'h1', 'kodeHeader': 'IJR-1', 'revision': 1},
      'realisasi': [
        {'realisasiId': 'r1', 'penyulang': 'PNY-A', 'tier': 'Tier 1', 'totalTiang': 12, 'revision': 1, 'temuan': []}
      ],
    };
    final g = InsJarLokal.gabung(d, server);
    expect(InsJarLokal.realisasi(g, 'r1')!['totalTiang'], 20);
    expect(InsJarLokal.hitung(g).menunggu, 1);
    InsJarLokal.tandaiUbah(g, 'r1', null);
    expect(InsJarLokal.hitung(g).menunggu, 0);
  });

  test('pisahTemuan: data server tanpa foto, foto per slot, admin + penyulang', () {
    final m = MasterInsJar({
      'penyulang': [
        {'nama': 'PNY-A', 'section': ['SEC-1', 'SEC-2']}
      ],
      'jenisTemuan': [
        {'jenisTemuanId': 'jt-1', 'nama': 'Isolator retak'}
      ],
      'tier': ['Tier 1', 'Tier 2'],
    });
    expect(m.section('PNY-A'), ['SEC-1', 'SEC-2']);
    final p = pisahTemuan({
      'penyulang': 'PNY-A',
      'section': 'SEC-1',
      'jenisTemuan': 'Isolator retak',
      'nomorTiang': 'tb-12',
      'foto_TEMUAN': '/hp/t.jpg',
    }, m, admin: true);
    expect(p.data['jenisTemuanId'], 'jt-1');
    expect(p.data['penyulang'], 'PNY-A');
    expect(p.data.keys.any((k) => k.startsWith('foto')), isFalse);
    expect(p.foto, {'TEMUAN': '/hp/t.jpg'});
    expect(p.tampil['nomorTiang'], 'TB-12');
  });

  test('teks WA mengikuti format v1 (per tier, temuan per jenis, total tiang)', () {
    final teks = waTeksInsJar(tanggalTampil: 'Senin, 19 Oktober 2026', header: {
      'koordinatAwal': '-3.1, 106.5',
      'kmAwal': 10,
      'kmAkhir': 30,
    }, realisasi: [
      {
        'penyulang': 'PNY-A',
        'tier': 'Tier 1',
        'section': 'SEC-1',
        'totalTiang': 12,
        'temuan': [
          {'jenisTemuan': 'Isolator retak'},
          {'jenisTemuan': 'Isolator retak'},
        ],
      },
      {'penyulang': 'PNY-B', 'tier': 'Tier 2', 'section': '', 'totalTiang': 5, 'temuan': []},
    ]);
    expect(teks, contains('*Realisasi Inspeksi Jaringan*'));
    expect(teks, contains('Stand KM Awal / Akhir : 10 / 30'));
    expect(teks, contains('- Isolator retak : 2 Titik'));
    expect(teks, contains('- Nihil'));
    expect(teks, contains('Total Tiang hasil Inspeksi Tier 1 dan Tier 2 : *17 Tiang*'));
    expect(teks, contains('Section : SEC-1'));
    expect(teks, isNot(contains('Segmen')), reason: 'v1.0.5: segmen tidak lagi di penyulang utama');
  });

  test('v1.0.2: temuan yang foto temuan / tiangnya belum ada dihitung (syarat kirim WA)', () {
    final d = docAwal();
    expect(InsJarLokal.temuanFotoKurang(d), 1);
    InsJarLokal.tambahFoto(d, 't1', 'TEMUAN', '/hp/t.jpg');
    expect(InsJarLokal.temuanFotoKurang(d), 1);
    InsJarLokal.tambahFoto(d, 't1', 'TIANG', '/hp/g.jpg');
    expect(InsJarLokal.temuanFotoKurang(d), 0);
    expect(fotoTemuanWajib, isTrue);
  });

  test('v1.0.5: ubah temuan (isian lengkap, dikosongkan), antrean ubahTemuan, bertahan saat gabung', () {
    final d = docAwal();
    for (final id in ['h1', 'r1', 't1']) {
      InsJarLokal.tandai(d, id, null);
    }
    InsJarLokal.temuan(d, 't1')!['nomorTiang'] = 'TB-1';
    expect(InsJarLokal.aksiUbah('ubahTemuan'), isTrue);
    expect(InsJarLokal.aksiBuat('ubahTemuan'), isFalse);
    expect(InsJarLokal.induk('ubahTemuan', {'temuanId': 't1'}), 't1');
    expect(InsJarLokal.endpoint['ubahTemuan'], 'ubahTemuanInsJar');
    InsJarLokal.ubahIsianTemuan(d, 't1', {'jenisTemuan': 'Pohon', 'section': 'SEC-2'}, tandaiUbah: true);
    final t = InsJarLokal.temuan(d, 't1')!;
    expect([t['jenisTemuan'], t['section'], t['nomorTiang']], ['Pohon', 'SEC-2', '']);
    expect(InsJarLokal.hitung(d).menunggu, 1);
    final server = {
      'tanggal': '2026-10-19',
      'header': {'headerId': 'h1', 'kodeHeader': 'IJR-1', 'revision': 1},
      'realisasi': [
        {
          'realisasiId': 'r1',
          'penyulang': 'PNY-A',
          'tier': 'Tier 1',
          'revision': 1,
          'temuan': [
            {'temuanId': 't1', 'jenisTemuan': 'Isolator retak', 'section': 'SEC-1', 'nomorTiang': 'TB-1', 'revision': 3}
          ],
        }
      ],
    };
    final g = InsJarLokal.gabung(d, server);
    final tg = InsJarLokal.temuan(g, 't1')!;
    expect([tg['jenisTemuan'], tg['section'], tg['nomorTiang'], tg['revision']], ['Pohon', 'SEC-2', '', 3]);
    expect(InsJarLokal.hitung(g).menunggu, 1);
  });

  test('v1.0.5: grup temuan per jenis (terbanyak dulu), semua penyulang', () {
    final d = docAwal();
    InsJarLokal.tambahRealisasi(d, {'realisasiId': 'r2', 'penyulang': 'PNY-B', 'tier': 'Tier 1', 'totalTiang': 3});
    InsJarLokal.tambahTemuan(d, 'r2', {'temuanId': 't2', 'jenisTemuan': 'Pohon'});
    InsJarLokal.tambahTemuan(d, 'r2', {'temuanId': 't3', 'jenisTemuan': 'Isolator retak'});
    final g = InsJarLokal.grupTemuan(d);
    expect(g.map((x) => x.jenis).toList(), ['Isolator retak', 'Pohon']);
    expect(g.first.isi.map((x) => x.realisasi['penyulang']).toList(), ['PNY-A', 'PNY-B']);
    expect(InsJarLokal.semuaTemuan(d).length, 3);
  });

  test('v1.0.5: segmen temuan hanya object Jaringan (form + data kirim), awal form ubah', () {
    final m = MasterInsJar({
      'penyulang': [
        {'nama': 'PNY-A', 'section': ['SEC-1']}
      ],
      'jenisTemuan': [
        {'jenisTemuanId': 'jt-1', 'nama': 'Isolator retak'}
      ],
    });
    final pj = pisahTemuan({'objekInspeksi': 'Jaringan', 'section': 'SEC-1', 'jenisTemuan': 'Isolator retak', 'segmen': 'SG-1'}, m);
    final pg = pisahTemuan({'objekInspeksi': 'Gardu', 'section': 'SEC-1', 'jenisTemuan': 'Isolator retak', 'segmen': 'SG-1'}, m, admin: true);
    expect([pj.data['segmen'], pj.tampil['segmen']], ['SG-1', 'SG-1']);
    expect([pg.data.containsKey('segmen'), pg.tampil['segmen']], [false, '']);
    expect(segmenBerlaku('Jaringan'), isTrue);
    expect(segmenBerlaku('Gardu'), isFalse);
    expect(awalTemuan({'jenisTemuan': 'Isolator retak', 'section': 'SEC-1', 'nomorTiang': '', 'revision': 2}),
        {'jenisTemuan': 'Isolator retak', 'section': 'SEC-1', 'objekInspeksi': 'Jaringan'});
  });

  test('v1.0.5: section lain di penyulang yang sama dikelompokkan dalam satu kartu penyulang', () {
    final d = docAwal();
    InsJarLokal.tambahRealisasi(d, {'realisasiId': 'r2', 'penyulang': 'PNY-A', 'tier': 'Tier 1', 'section': 'SEC-2', 'totalTiang': 3});
    InsJarLokal.tambahRealisasi(d, {'realisasiId': 'r3', 'penyulang': 'PNY-B', 'tier': 'Tier 2', 'section': 'SEC-X', 'totalTiang': 1});
    final g = InsJarLokal.grupPenyulang(d);
    expect(g.map((x) => x.penyulang).toList(), ['PNY-A', 'PNY-B']);
    expect(g.first.realisasi.map((r) => r['section']).toList(), ['SEC-1', 'SEC-2']);
    expect(InsJarLokal.realisasiPenyulang(d, 'PNY-A').length, 2);
  });

  test('v1.0.5: petugas tidak mengirim section (dari penyulang utama), admin mengirim section + penyulang', () {
    final m = MasterInsJar({
      'penyulang': [
        {'nama': 'PNY-A', 'section': ['SEC-1']}
      ],
      'jenisTemuan': [
        {'jenisTemuanId': 'jt-1', 'nama': 'Isolator retak'}
      ],
    });
    final n = {'objekInspeksi': 'Jaringan', 'section': 'SEC-1', 'jenisTemuan': 'Isolator retak', 'realisasiId': 'r1'};
    final petugas = pisahTemuan(n, m);
    expect(petugas.data.containsKey('section'), isFalse);
    expect(petugas.tampil['section'], 'SEC-1');
    final admin = pisahTemuan({...n, 'penyulang': 'PNY-A'}, m, admin: true);
    expect(admin.data['section'], 'SEC-1');
    expect(admin.data['penyulang'], 'PNY-A');
  });

  test('v1.0.6: WA: penyulang sama digabung, tiap section punya Temuan dan Jumlah Tiang', () {
    final teks = waTeksInsJar(tanggalTampil: 'Senin', header: const {}, realisasi: [
      {'penyulang': 'Bikang', 'tier': 'Tier 1', 'section': 'A - B', 'totalTiang': 10, 'temuan': [{'jenisTemuan': 'a'}]},
      {'penyulang': 'Bikang', 'tier': 'Tier 1', 'section': 'B - C', 'totalTiang': 5, 'temuan': []},
    ]);
    expect(teks, contains('1. Penyulang *Bikang*\nSection : A - B\nTemuan :\n- a : 1 Titik\nJumlah Tiang yang di Inspeksi : *10 Tiang*\n\nSection : B - C\nTemuan :\n- Nihil\nJumlah Tiang yang di Inspeksi : *5 Tiang*'));
    expect(teks, contains('Total Tiang yang di Inspeksi Tier 1 Penyulang *Bikang* : *15 Tiang*'));
    expect(RegExp(r'^1\. Penyulang \*Bikang\*', multiLine: true).allMatches(teks).length, 1);
  });
}
