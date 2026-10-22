import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/core/versi.dart';

void main() {
  // v0.81.0: notifikasi update versi
  test('banding versi angka per bagian', () {
    expect(bandingVersi('0.80.0', '0.81.0'), -1);
    expect(bandingVersi('0.81.0', '0.81.0'), 0);
    expect(bandingVersi('0.100.0', '0.81.0'), 1);
    expect(bandingVersi('1.0', '0.81.0'), isNull);
  });

  test('status: wajib < minimum, tersedia < server, server lama, sama', () {
    const i = InfoVersi(server: '0.82.0', minimum: '0.81.0');
    expect(i.statusUntuk('0.80.5'), StatusVersi.wajibUpdate);
    expect(i.statusUntuk('0.81.0'), StatusVersi.updateTersedia);
    expect(i.statusUntuk('0.82.0'), StatusVersi.sama);
    expect(i.statusUntuk('0.83.0'), StatusVersi.serverLama);
    expect(i.statusUntuk('x'), StatusVersi.tidakDiketahui);
  });

  test('dariJson: minimum tidak valid = server, link non-https dibuang', () {
    final i = InfoVersi.dariJson({'server': '0.81.0', 'minimum': 'abc', 'linkUnduh': 'http://x', 'catatan': 'a | b'})!;
    expect([i.minimum, i.linkUnduh, i.catatan], ['0.81.0', '', 'a | b']);
    expect(InfoVersi.dariJson({'server': ''}), isNull);
    expect(InfoVersi.dariJson(null), isNull);
    expect(versiApp, matches(RegExp(r'^\d+\.\d+\.\d+$')));
  });
}
