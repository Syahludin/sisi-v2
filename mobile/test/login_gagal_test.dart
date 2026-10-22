import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/widgets/login_gagal_card.dart';

void main() {
  test('kode server -> jenis kartu login gagal', () {
    expect(jenisLoginGagal('LOGIN_GAGAL'), JenisLoginGagal.salah);
    expect(jenisLoginGagal('AKUN_TERKUNCI'), JenisLoginGagal.salah);
    expect(jenisLoginGagal('LOGIN_DIBATASI'), JenisLoginGagal.dibatasi);
    expect(jenisLoginGagal('TERLALU_SERING'), JenisLoginGagal.sibuk);
    expect(jenisLoginGagal('SERVER_SIBUK'), JenisLoginGagal.sibuk);
    expect(jenisLoginGagal('GPS_PALSU'), isNull, reason: 'GPS palsu punya dialog sendiri');
    expect(jenisLoginGagal('HTTP_500'), isNull);
  });

  Future<void> pasang(WidgetTester t, JenisLoginGagal j, int n) => t.pumpWidget(MaterialApp(
        home: Scaffold(body: KartuLoginGagal(jenis: j, username: ' 16130.ROW01 ', percobaan: n, onTutup: () {})),
      ));

  testWidgets('kartu salah: username dirapikan, tanpa hitungan, peringatan 15 menit baru di percobaan ke-5', (t) async {
    expect(batasPeringatanLogin, 5);
    await pasang(t, JenisLoginGagal.salah, 1);
    expect(find.text('LOGIN GAGAL'), findsOneWidget);
    expect(find.text('16130.row01'), findsOneWidget);
    expect(find.text('1 kali'), findsNothing, reason: 'hitungan salah tidak ditampilkan');
    expect(find.textContaining('dibatasi'), findsNothing);
    expect(find.textContaining('15 menit'), findsNothing);
    await pasang(t, JenisLoginGagal.salah, 4);
    expect(find.textContaining('15 menit'), findsNothing);
    await pasang(t, JenisLoginGagal.salah, 5);
    expect(find.text('Sudah 5 kali salah. Coba login lagi dalam 15 menit atau hubungi Admin.'), findsOneWidget);
    expect(find.text('Coba Lagi'), findsOneWidget);
  });

  testWidgets('kartu ditahan & sibuk tanpa hitungan salah', (t) async {
    await pasang(t, JenisLoginGagal.dibatasi, 4);
    expect(find.text('LOGIN DITAHAN'), findsOneWidget);
    expect(find.text('4 kali'), findsNothing);
    await pasang(t, JenisLoginGagal.sibuk, 1);
    expect(find.text('SERVER SIBUK'), findsOneWidget);
    expect(find.text('Mengerti'), findsOneWidget);
  });
}
