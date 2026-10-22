import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/widgets/kolom_pilih.dart';

void main() {
  testWidgets('KolomPilih v0.61: daftar panjang bisa dicari, urutan tetap, nomor urut ikut tampil', (t) async {
    String? hasil;
    final pilihan = [for (var i = 1; i <= 20; i++) PilihanItem('id$i', 'Section $i')];
    await t.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Form(child: KolomPilih(label: 'Section', pilihan: pilihan, bernomor: true, onChanged: (v) => hasil = v)),
      ),
    ));
    await t.tap(find.byType(KolomPilih));
    await t.pumpAndSettle();
    expect(find.text('Section 1'), findsOneWidget, reason: 'item pertama (dekat PMT) tampil paling atas');
    expect(find.byType(TextField), findsOneWidget, reason: 'lebih dari 8 pilihan = ada kolom cari');
    await t.enterText(find.byType(TextField), 'section 20');
    await t.pump();
    expect(find.text('Section 20'), findsOneWidget);
    expect(find.text('Section 2'), findsNothing);
    await t.tap(find.text('Section 20'));
    await t.pumpAndSettle();
    expect(hasil, 'id20');
    expect(find.text('20. Section 20'), findsOneWidget);
  });
}
