import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/features/hartek/hartek_form.dart';
import 'package:sisi_row/features/yandal/p0_model.dart';
import 'package:sisi_row/theme/app_colors.dart';
import 'package:sisi_row/widgets/sisi_loader.dart';
import 'package:sisi_row/widgets/sisi_widgets.dart';

/// v1.0.31 (permintaan Master Guswan 24 Okt 2026): kolom wajib kosong = tidak tersimpan, kolom merah, layar digulir ke sana;
/// loader S utuh; teks WA P0 dari WO.
void main() {
  test('loader: S utuh, ruas terakhir naik ke kiri atas (ekor bawah = cermin ekor atas)', () {
    final t = SisiLoader.titik;
    expect(t.length, 6);
    final a = t[t.length - 2], b = t.last;
    expect(b.dx < a.dx && b.dy < a.dy, isTrue, reason: 'kanan bawah -> kiri atas');
    // v1.0.33: titik atas dan bawah satu garis tegak; S simetris titik terhadap pusat (tiap titik punya cermin)
    expect(t[1].dx, t[4].dx);
    for (var i = 0; i < t.length; i++) {
      final c = t[t.length - 1 - i];
      expect((t[i].dx + c.dx - 1).abs() < 1e-9 && (t[i].dy + c.dy - 1).abs() < 1e-9, isTrue, reason: 'titik $i');
    }
  });

  testWidgets('validasiForm: kolom wajib kosong merah, digulir ke kolom pertama, tidak lolos', (t) async {
    final kunci = GlobalKey<FormState>();
    final c = TextEditingController();
    await t.pumpWidget(MaterialApp(
      home: Scaffold(
        // form tidak lazy (seperti form SiSi v1.0.31): kolom jauh di bawah layar tetap divalidasi
        body: Form(
          key: kunci,
          child: SingleChildScrollView(
            child: Column(children: [
              for (var i = 0; i < 12; i++) SizedBox(height: 120, child: Text('isi $i')),
              TextFormField(key: const ValueKey('wajib'), controller: c, validator: (v) => (v ?? '').isEmpty ? 'Nama wajib diisi' : null),
            ]),
          ),
        ),
      ),
    ));
    expect(find.byKey(const ValueKey('wajib')).hitTestable(), findsNothing, reason: 'awalnya di bawah layar');
    expect(validasiForm(kunci), isFalse);
    await t.pumpAndSettle();
    expect(find.text('Nama wajib diisi'), findsOneWidget);
    expect(find.byKey(const ValueKey('wajib')).hitTestable(), findsOneWidget, reason: 'digulir ke kolom merah');
    c.text = 'ada';
    expect(validasiForm(kunci), isTrue);
  });

  testWidgets('BingkaiWajib: bingkai + pesan merah hanya saat salah', (t) async {
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: BingkaiWajib(salah: null, child: Text('foto')))));
    expect(find.byIcon(Icons.error_outline_rounded), findsNothing);
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: BingkaiWajib(salah: 'Foto Arus wajib diambil', child: Text('foto')))));
    expect(find.text('Foto Arus wajib diambil'), findsOneWidget);
    expect(find.text('foto'), findsOneWidget);
  });

  testWidgets('mesin form: ubin wajib belum dipilih + label jadi merah, Simpan tidak mengirim', (t) async {
    Map<String, String>? terkirim;
    await t.pumpWidget(MaterialApp(home: Builder(builder: (context) => Scaffold(
          body: TextButton(
            onPressed: () => bukaFormHartek(context,
                judul: 'Uji',
                keterangan: 'Contoh',
                daftar: (n) => const [IsianHartek('jenis', 'Jenis pekerjaan', wajib: true, segmen: true, pilihan: ['Jaringan', 'Gardu'])],
                simpan: (n) async {
                  terkirim = n;
                  return {};
                }),
            child: const Text('Buka'),
          ),
        ))));
    await t.tap(find.text('Buka'));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('simpan-hartek')));
    await t.pumpAndSettle();
    expect(terkirim, isNull);
    expect(find.text('Jenis pekerjaan wajib diisi'), findsOneWidget);
    final label = t.widget<Text>(find.byWidgetPredicate((w) => w is Text && w.textSpan?.toPlainText() == 'Jenis pekerjaan *'));
    expect(label.style?.color, AppColors.red700);
    final ubin = t.widget<Material>(find.ancestor(of: find.byKey(const ValueKey('pilih-jenis-Gardu')), matching: find.byType(Material)).first);
    expect((ubin.shape! as RoundedRectangleBorder).side.color, AppColors.red600);
  });

  test('teks WA P0 dari WO sama format dengan P0 lokal', () {
    expect(
        teksWaPenugasanP0(pekerjaan: 'Ganti FCO', penyulang: 'Tanjung Labu', section: '', daerah: 'Toboali', petugas: ['A', 'B']),
        '*FORMAT PENUGASAN KHUSUS*\n\nPekerjaan : Ganti FCO\nPenyulang : Tanjung Labu\nSection : -\nDaerah : Toboali\nPetugas : A dan B');
  });
}
