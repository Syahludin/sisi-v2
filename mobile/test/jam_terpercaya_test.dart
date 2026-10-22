import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/core/jam_terpercaya.dart';
import 'package:sisi_row/features/yandal/p0_model.dart';

/// v0.64.2: jam terpercaya = jam server patokan + jam monoton. Jam HP hanya cadangan (ditandai HP).
void dekat(DateTime a, DateTime b) => expect(a.difference(b).inMilliseconds.abs() < 100, isTrue, reason: '$a vs $b');

void main() {
  late int mono; // ms sejak HP menyala
  late int boot;
  late DateTime hp; // jam dinding HP (bisa diubah petugas)
  BacaanMonoton? Function() bacaan = () => null;

  JamTerpercaya buat(PenyimpanPatokan simpan) => JamTerpercaya(
        monoton: () async => bacaan(),
        jamHp: () => hp,
        penyimpan: simpan,
      );

  setUp(() {
    mono = 3600000;
    boot = 12;
    hp = DateTime.utc(2026, 10, 8, 3); // 10:00 WIB
    bacaan = () => BacaanMonoton(elapsedMs: mono, bootCount: boot, waktuOtomatis: true);
  });

  test('tanpa patokan = jam HP (sumber HP)', () async {
    final j = buat(PenyimpanPatokanMemori());
    await j.muat();
    final w = await j.catat();
    expect([w.sumber, w.waktu, w.tervalidasi], <Object>['HP', hp, false]);
  });

  test('setelah jawaban server: waktu ikut jam monoton, jam HP diubah tidak berpengaruh', () async {
    final j = buat(PenyimpanPatokanMemori());
    await j.muat();
    final server = DateTime.utc(2026, 10, 8, 3, 0, 5);
    await j.setelServer(server);
    mono += 90 * 60000; // 90 menit kemudian (termasuk layar mati)
    hp = DateTime.utc(2026, 10, 8, 2); // petugas memundurkan jam HP
    final w = await j.catat();
    expect(w.sumber, 'SERVER');
    dekat(w.waktu, server.add(const Duration(minutes: 90)));
    expect(w.jamHpMenyimpang, isTrue);
    expect(w.selisihHp.inMinutes, -150);
    expect(j.waktuOtomatis, isTrue);
  });

  test('patokan bertahan walau app ditutup (boot sama), dibuang kalau HP restart', () async {
    final simpan = PenyimpanPatokanMemori();
    final a = buat(simpan);
    await a.muat();
    await a.setelServer(DateTime.utc(2026, 10, 8, 3));
    mono += 600000;
    final b = buat(simpan); // app dibuka lagi
    await b.muat();
    dekat((await b.catat()).waktu, DateTime.utc(2026, 10, 8, 3, 10));

    boot = 13; // HP restart (nomor boot berubah), jam monoton kebetulan lebih besar
    mono += 3600000;
    final c = buat(simpan);
    await c.muat();
    expect((await c.catat()).sumber, 'HP');
    expect(simpan.isi, isNull, reason: 'patokan basi dihapus');
  });

  test('jam monoton mengecil (restart di HP tanpa nomor boot) / patokan > 7 hari = jam HP', () async {
    final simpan = PenyimpanPatokanMemori();
    boot = -1;
    final a = buat(simpan);
    await a.muat();
    await a.setelServer(DateTime.utc(2026, 10, 8, 3));
    mono = 1000;
    await a.segarkan();
    expect(a.cek().sumber, 'HP');

    mono = 5000;
    await a.setelServer(DateTime.utc(2026, 10, 8, 3));
    mono += const Duration(days: 8).inMilliseconds;
    expect((await a.catat()).sumber, 'HP');
  });

  test('kode native belum terpasang: tidak ada patokan, selalu jam HP', () async {
    bacaan = () => null;
    final j = buat(PenyimpanPatokanMemori());
    await j.muat();
    await j.setelServer(DateTime.utc(2026, 10, 8, 3));
    expect((await j.catat()).sumber, 'HP');
  });

  test('waktu tercatat & sumber waktu P0 ikut tersimpan (json)', () {
    final w = WaktuTercatat(waktu: DateTime.utc(2026, 10, 8, 3), waktuHp: DateTime.utc(2026, 10, 8, 2, 50), sumber: 'SERVER');
    final b = WaktuTercatat.dariJson(w.keJson());
    expect([b.waktu, b.waktuHp, b.sumber], [w.waktu, w.waktuHp, 'SERVER']);
    expect(b.jamHpMenyimpang, isTrue);
    final f = FotoP0(path: '/a.jpg', waktu: w.waktu, sumber: 'KAMERA', waktuHp: w.waktuHp, sumberWaktu: 'SERVER');
    final g = FotoP0.dariJson(f.keJson());
    expect([g.waktuHp, g.sumberWaktu], [w.waktuHp, 'SERVER']);
    final p = P0Lokal(id: 'i', userId: 'u', shiftId: 's', kodeShift: '', no: 1, namaPekerjaan: 'X', dibuat: w.waktu, sumberWaktu: 'SERVER', foto: {'SEBELUM': g});
    expect(p.adaWaktuHp, isFalse);
    expect(P0Lokal.dariJson(p.keJson()).sumberWaktu, 'SERVER');
    expect(P0Lokal(id: 'i', userId: 'u', shiftId: 's', kodeShift: '', no: 1, namaPekerjaan: 'X', dibuat: w.waktu).adaWaktuHp, isTrue);
  });
}
