import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/features/absensi/absensi_antre.dart';
import 'package:sisi_row/features/absensi/absensi_model.dart';
import 'package:sisi_row/features/absensi/absensi_screen.dart';
import 'package:sisi_row/widgets/wa_panel.dart';

DataAbsensi _data() => DataAbsensi.dariJson({
      'tanggal': '2026-11-02',
      'jamSimpan': '07.32',
      'teksWa': '*Absensi dari server*',
      'rekap': {
        'c': {'TELAT': 1, 'TANPA_KET': 0, 'ABSEN': 0, 'KET': 0, 'TMK': 0, 'CUTI': 0, 'IZIN': 0},
      },
      'tim': [
        {'timId': 't1', 'nama': 'Tim Row 1', 'jenis': 'ROW'},
        {'timId': 't2', 'nama': 'Hartek', 'jenis': 'HARTEK'},
      ],
      'staf': [
        {'petugasId': 'a', 'nama': 'Agus Adi', 'timId': 't1', 'status': null, 'keterangan': '', 'diabsenOleh': null, 'milikSaya': false},
        {'petugasId': 'b', 'nama': 'Paltrada', 'timId': 't1', 'status': 'HADIR', 'keterangan': '', 'diabsenOleh': {'userId': 'u2', 'nama': 'Admin Utama'}, 'milikSaya': false},
        {'petugasId': 'c', 'nama': 'Haryanto', 'timId': 't2', 'status': 'TELAT', 'keterangan': '', 'diabsenOleh': {'userId': 'u1', 'nama': 'Koordinator'}, 'milikSaya': true},
      ],
    });

typedef _Hasil = ({List<Map<String, IsianAbsensi>> disimpan, List<String> disalin, List<String> dikirimWa, List<String> dibuang, List<int> muat});

void main() {
  Future<_Hasil> pasang(
    WidgetTester t, {
    List<ItemAntreAbsensi> antre = const [],
    DataAbsensi Function()? data,
    void Function(Map<String, IsianAbsensi> isian)? saatSimpan,
    DateTime? sekarang,
    Size layar = const Size(800, 1800),
  }) async {
    final disimpan = <Map<String, IsianAbsensi>>[];
    final disalin = <String>[];
    final dikirimWa = <String>[];
    final dibuang = <String>[];
    final muat = <int>[];
    t.view.physicalSize = layar;
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(
      home: AbsensiPanel(
        muat: () async {
          muat.add(1);
          return (data ?? _data)();
        },
        antrean: () async => List.of(antre),
        simpan: (tanggal, isian) async {
          expect(tanggal, '2026-11-02');
          disimpan.add(isian);
          saatSimpan?.call(isian);
        },
        buang: (tanggal, petugasId) async => dibuang.add('$tanggal|$petugasId'),
        salin: (teks) async => disalin.add(teks),
        kirimWa: (c, teks) async => dikirimWa.add(teks),
        sekarang: () => sekarang ?? DateTime.utc(2026, 11, 2, 0, 30), // 07.30 WIB
      ),
    ));
    await t.pumpAndSettle();
    return (disimpan: disimpan, disalin: disalin, dikirimWa: dikirimWa, dibuang: dibuang, muat: muat);
  }

  Future<void> bukaTim(WidgetTester t, String nama) async {
    await t.tap(find.text(nama));
    await t.pumpAndSettle();
  }

  testWidgets('layar 1: hero ringkasan + satu kartu per tim; petugas baru tampil setelah kartu tim diketuk', (t) async {
    await pasang(t);
    expect(find.text('Senin, 2 November 2026'), findsWidgets);
    expect(find.text('2'), findsWidgets, reason: 'hero: 2 dari 3 sudah diabsen');
    expect(find.text('dari 3 petugas sudah diabsen'), findsOneWidget);
    expect(find.text('Tim Row 1'), findsOneWidget);
    expect(find.text('Hartek'), findsOneWidget);
    expect(find.text('1 dari 2 petugas sudah diabsen'), findsOneWidget);
    expect(find.text('1 dari 1 petugas sudah diabsen'), findsOneWidget);
    expect(find.text('Agus Adi'), findsNothing, reason: 'nama petugas ada di layar tim, bukan di layar 1');
    await bukaTim(t, 'Tim Row 1');
    expect(find.text('Agus Adi'), findsOneWidget);
    expect(find.text('Paltrada'), findsOneWidget);
    expect(find.text('Haryanto'), findsNothing);
    expect(find.text('Belum diabsen'), findsOneWidget);
    expect(find.textContaining('Diabsen oleh'), findsNothing, reason: 'tidak perlu diberitahu siapa yang mengisi (permintaan Bapak)');
    expect(find.textContaining('Admin Utama'), findsNothing);
    expect(find.textContaining('Koordinator'), findsNothing);
  });

  testWidgets('petugas yang diisi rekan terkunci: pesan, tanpa pilihan status; isian sendiri boleh diubah', (t) async {
    await pasang(t);
    await bukaTim(t, 'Tim Row 1');
    await t.tap(find.text('Paltrada'));
    await t.pumpAndSettle();
    expect(find.text('Paltrada sudah diabsen pengabsen lain, tidak bisa diubah.'), findsOneWidget);
    expect(find.textContaining('Admin Utama'), findsNothing);
    expect(find.text('Hadir Telat'), findsNothing);
    await t.pageBack();
    await t.pumpAndSettle();
    await bukaTim(t, 'Hartek');
    await t.tap(find.text('Haryanto'));
    await t.pumpAndSettle();
    expect(find.text('Hadir Telat'), findsOneWidget, reason: 'milik sendiri: sheet pilihan terbuka');
  });

  testWidgets('pilih status di layar tim lalu Simpan dari layar tim: hanya yang dipilih dikirim, kedua layar tertutup', (t) async {
    final h = await pasang(t);
    await bukaTim(t, 'Tim Row 1');
    await t.tap(find.text('Agus Adi'));
    await t.pumpAndSettle();
    await t.tap(find.text('Hadir Telat'));
    await t.pump();
    await t.tap(find.text('Pilih'));
    await t.pumpAndSettle();
    expect(find.text('Dipilih, belum disimpan'), findsOneWidget);
    await t.tap(find.text('Simpan (1)'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 300));
    expect(find.text('Data berhasil disimpan'), findsOneWidget, reason: 'pop up kartu berkedip menggantikan pesan teks');
    expect(find.text('Dikirim otomatis ke server'), findsOneWidget);
    expect(find.text('Tersimpan di HP, dikirim otomatis ke server.'), findsNothing, reason: 'pesan teks lama diganti pop up');
    await t.pumpAndSettle();
    expect(h.disimpan.length, 1);
    expect(h.disimpan.single.keys, ['a']);
    expect(h.disimpan.single['a']!.status, StatusAbsensi.telat);
    // kembali ke halaman absensi (kartu per tim), BUKAN ke menu utama
    expect(find.text('Safety Briefing'), findsOneWidget);
    expect(find.text('Tim Row 1'), findsOneWidget);
    expect(find.text('Agus Adi'), findsNothing, reason: 'layar petugas tim sudah ditutup');
    expect(find.text('Pilih status petugas dulu'), findsOneWidget, reason: 'pilihan sudah masuk antrean');
    await t.tap(find.text('Tim Row 1'));
    await t.pumpAndSettle();
    expect(find.text('Agus Adi'), findsOneWidget, reason: 'kartu tim masih bisa dibuka lagi');
  });

  testWidgets('Simpan dari halaman kartu tim: tetap di halaman absensi', (t) async {
    final h = await pasang(t);
    await bukaTim(t, 'Tim Row 1');
    await t.tap(find.text('Agus Adi'));
    await t.pumpAndSettle();
    await t.tap(find.text('Hadir Tepat Waktu'));
    await t.pump();
    await t.tap(find.text('Pilih'));
    await t.pumpAndSettle();
    await t.pageBack();
    await t.pumpAndSettle();
    await t.tap(find.text('Simpan (1)'));
    await t.pumpAndSettle();
    expect(h.disimpan.length, 1);
    expect(find.text('Safety Briefing'), findsOneWidget, reason: 'tidak keluar ke menu utama');
  });

  testWidgets('KET / IZIN wajib alasan: tombol Pilih mati sampai diisi, alasan ikut terkirim', (t) async {
    final h = await pasang(t);
    await bukaTim(t, 'Tim Row 1');
    await t.tap(find.text('Agus Adi'));
    await t.pumpAndSettle();
    await t.tap(find.text('Tidak Hadir dengan Keterangan'));
    await t.pumpAndSettle();
    expect(_tombol(t, 'Pilih').onPressed, isNull);
    await t.enterText(find.byType(TextField), '   ');
    await t.pump();
    expect(_tombol(t, 'Pilih').onPressed, isNull, reason: 'spasi saja bukan alasan');
    await t.enterText(find.byType(TextField), 'Mobil Masuk Bengkel');
    await t.pump();
    await t.tap(find.text('Pilih'));
    await t.pumpAndSettle();
    expect(find.text('Alasan: Mobil Masuk Bengkel'), findsOneWidget);
    await t.tap(find.text('Simpan (1)'));
    await t.pumpAndSettle();
    expect(h.disimpan.single['a']!.keJson('a'), {'petugasId': 'a', 'status': 'KET', 'keterangan': 'Mobil Masuk Bengkel'});
  });

  testWidgets('daftar status DAPAT DIGULIR di layar kecil: semua 8 status terjangkau dan bisa dipilih', (t) async {
    await pasang(t, layar: const Size(400, 520));
    await bukaTim(t, 'Tim Row 1');
    await t.tap(find.text('Agus Adi'));
    await t.pumpAndSettle();
    // layar 520 px: tidak semua status muat sekaligus, daftar harus bisa digulir
    final gulir = find.descendant(of: find.byType(BottomSheet), matching: find.byType(Scrollable)).first;
    await t.scrollUntilVisible(find.text('Izin tidak masuk kerja'), 80, scrollable: gulir);
    await t.drag(gulir, const Offset(0, -120));
    await t.pumpAndSettle();
    await t.tap(find.text('Izin tidak masuk kerja'));
    await t.pumpAndSettle();
    expect(find.text('Alasan (wajib)'), findsOneWidget, reason: 'IZIN membuka isian alasan');
    expect(find.text('Pilih'), findsOneWidget, reason: 'tombol tetap terlihat di bawah');
    // gulir kembali ke atas: status pertama juga terjangkau
    await t.scrollUntilVisible(find.text('Hadir Tepat Waktu'), -80, scrollable: gulir);
    expect(find.text('Hadir Tepat Waktu'), findsOneWidget);
  });

  testWidgets('antrean HP: menunggu kirim tampil; ditolak server tampil dengan alasan dan bisa dibuang', (t) async {
    final h = await pasang(t, antre: const [
      ItemAntreAbsensi(tanggal: '2026-11-02', petugasId: 'a', status: StatusAbsensi.hadir),
      ItemAntreAbsensi(tanggal: '2026-11-02', petugasId: 'c', status: StatusAbsensi.cuti, galat: 'DIKUNCI_PENGABSEN_LAIN'),
    ]);
    expect(find.text('1 isian ditolak server, ketuk untuk melihat'), findsOneWidget, reason: 'kartu tim Hartek memberi tahu');
    await bukaTim(t, 'Tim Row 1');
    expect(find.text('Menunggu kirim ke server'), findsOneWidget);
    await t.pageBack();
    await t.pumpAndSettle();
    await bukaTim(t, 'Hartek');
    expect(find.textContaining('Ditolak: Staf ini sudah diabsen oleh pengabsen lain'), findsOneWidget);
    await t.tap(find.byTooltip('Buang isian ini'));
    await t.pumpAndSettle();
    expect(h.dibuang, ['2026-11-02|c']);
  });

  testWidgets('tanggal sudah berganti saat Simpan: tidak menyimpan, layar dimuat ulang', (t) async {
    final h = await pasang(t, sekarang: DateTime.utc(2026, 11, 2, 17, 30)); // 00.30 WIB tanggal 3
    await bukaTim(t, 'Tim Row 1');
    await t.tap(find.text('Agus Adi'));
    await t.pumpAndSettle();
    await t.tap(find.text('Hadir Tepat Waktu'));
    await t.pump();
    await t.tap(find.text('Pilih'));
    await t.pumpAndSettle();
    await t.tap(find.text('Simpan (1)'));
    await t.pumpAndSettle();
    expect(h.disimpan, isEmpty);
    expect(find.textContaining('Tanggal sudah berganti'), findsOneWidget);
    expect(find.text('Pilih status petugas dulu'), findsOneWidget, reason: 'pilihan lama dibuang');
  });

  testWidgets('Kirim WA dibuat LOKAL: tanpa menunggu server, memuat data hanya sekali (saat layar dibuka)', (t) async {
    final h = await pasang(t);
    expect(h.muat.length, 1);
    await t.tap(find.byKey(const ValueKey('tombol-wa-kartu')));
    await t.pumpAndSettle();
    expect(h.muat.length, 1, reason: 'tidak ada panggilan server saat tombol WA ditekan');
    expect(h.dikirimWa.length, 1);
    final baris = h.dikirimWa.single.split('\n');
    expect(baris.take(3).toList(), ['*Absensi kehadiran safety breafing November 2026*', 'Senin, 2 November 2026', 'Pukul : 07.32 WIB']);
    expect(baris, contains('*Tim Row 1*'));
    expect(baris, contains('* Paltrada ✅'));
    expect(baris, contains('* Agus Adi ⏳ belum diabsen'));
    expect(baris, contains('* Haryanto *️⃣1'), reason: 'rekap server dipakai sebagai dasar');
    expect(h.dikirimWa.single.contains('dari server'), isFalse, reason: 'bukan teks server');
  });

  bool waAktif(WidgetTester t) => t.widget<TombolWaBulat>(find.byType(TombolWaBulat)).onTap != null;

  testWidgets('WA hanya aktif bila format siap dan data sudah sinkron: aktif saat tidak ada yang tertunda', (t) async {
    final h = await pasang(t);
    expect(waAktif(t), isTrue);
    expect(t.widget<IconButton>(find.widgetWithIcon(IconButton, Icons.copy_rounded)).onPressed, isNotNull);
    expect(find.textContaining('Menyinkronkan'), findsNothing);
    await t.tap(find.byKey(const ValueKey('tombol-wa-kartu')));
    await t.pumpAndSettle();
    expect(h.dikirimWa.length, 1);
  });

  testWidgets('pilihan belum disimpan: WA dan Salin mati, petunjuk "Simpan dulu"', (t) async {
    final h = await pasang(t);
    await bukaTim(t, 'Tim Row 1');
    await t.tap(find.text('Agus Adi'));
    await t.pumpAndSettle();
    await t.tap(find.text('Hadir Tepat Waktu'));
    await t.pump();
    await t.tap(find.text('Pilih'));
    await t.pumpAndSettle();
    await t.pageBack();
    await t.pumpAndSettle();
    expect(waAktif(t), isFalse);
    expect(t.widget<IconButton>(find.widgetWithIcon(IconButton, Icons.copy_rounded)).onPressed, isNull);
    expect(find.textContaining('Simpan dulu'), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('tombol-wa-kartu')));
    await t.pumpAndSettle();
    expect(h.dikirimWa, isEmpty, reason: 'tombol mati tidak mengirim');
  });

  testWidgets('sesudah Simpan: WA mati selama sinkron; begitu antrean kosong data dimuat ulang dari server dan WA aktif dengan teks terbaru', (t) async {
    final antre = <ItemAntreAbsensi>[];
    var sinkron = false; // true = server sudah menerima isian Agus
    DataAbsensi data() => sinkron
        ? DataAbsensi.dariJson({
            'tanggal': '2026-11-02',
            'jamSimpan': '07.35',
            'tim': [
              {'timId': 't1', 'nama': 'Tim Row 1', 'jenis': 'ROW'}
            ],
            'staf': [
              {'petugasId': 'a', 'nama': 'Agus Adi', 'timId': 't1', 'status': 'HADIR', 'keterangan': '', 'milikSaya': true},
            ],
          })
        : DataAbsensi.dariJson({
            'tanggal': '2026-11-02',
            'jamSimpan': '07.32',
            'tim': [
              {'timId': 't1', 'nama': 'Tim Row 1', 'jenis': 'ROW'}
            ],
            'staf': [
              {'petugasId': 'a', 'nama': 'Agus Adi', 'timId': 't1', 'status': null, 'keterangan': '', 'milikSaya': false},
            ],
          });
    final h = await pasang(t,
        antre: antre,
        data: data,
        saatSimpan: (isian) => antre.addAll([for (final e in isian.entries) ItemAntreAbsensi(tanggal: '2026-11-02', petugasId: e.key, status: e.value.status)]));
    await bukaTim(t, 'Tim Row 1');
    await t.tap(find.text('Agus Adi'));
    await t.pumpAndSettle();
    await t.tap(find.text('Hadir Tepat Waktu'));
    await t.pump();
    await t.tap(find.text('Pilih'));
    await t.pumpAndSettle();
    await t.tap(find.text('Simpan (1)'));
    await t.pumpAndSettle();
    // antrean HP berisi 1 isian yang belum diterima server
    expect(waAktif(t), isFalse, reason: 'sedang sinkron: WA mati');
    expect(t.widget<IconButton>(find.widgetWithIcon(IconButton, Icons.copy_rounded)).onPressed, isNull);
    expect(find.textContaining('Menyinkronkan'), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('tombol-wa-kartu')));
    await t.pump();
    expect(h.dikirimWa, isEmpty);
    final muatSebelum = h.muat.length;
    // server menerima isian: antrean kosong. Layar memantau antrean, lalu memuat ulang data server
    antre.clear();
    sinkron = true;
    await t.pump(const Duration(seconds: 3));
    await t.pumpAndSettle();
    expect(h.muat.length, muatSebelum + 1, reason: 'data server dimuat ulang begitu sinkron selesai');
    expect(find.textContaining('Menyinkronkan'), findsNothing);
    expect(waAktif(t), isTrue, reason: 'format siap + data sinkron = WA aktif');
    await t.tap(find.byKey(const ValueKey('tombol-wa-kartu')));
    await t.pumpAndSettle();
    final baris = h.dikirimWa.single.split('\n');
    expect(baris, contains('* Agus Adi ✅'));
    expect(baris, contains('Pukul : 07.35 WIB'), reason: 'jam simpan server, bukan jam HP');
  });

  testWidgets('isian ditolak server (bergalat) bukan "tertunda": WA tetap aktif', (t) async {
    await pasang(t, antre: const [ItemAntreAbsensi(tanggal: '2026-11-02', petugasId: 'c', status: StatusAbsensi.cuti, galat: 'DIKUNCI_PENGABSEN_LAIN')]);
    expect(waAktif(t), isTrue);
    expect(find.textContaining('Menyinkronkan'), findsNothing);
  });

  testWidgets('Salin teks memakai teks lokal yang sama dengan Kirim WA', (t) async {
    final h = await pasang(t);
    await t.tap(find.byTooltip('Salin teks WhatsApp'));
    await t.pumpAndSettle();
    expect(h.muat.length, 1, reason: 'salin juga lokal');
    expect(h.disalin.single, contains('* Paltrada ✅'));
  });
}

FilledButton _tombol(WidgetTester t, String teks) => t.widget<FilledButton>(find.ancestor(of: find.text(teks), matching: find.byType(FilledButton)));
