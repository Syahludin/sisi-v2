import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/features/settings/ganti_password_screen.dart';

/// v0.67.0: aturan password baru di HP (server memeriksa ulang).
void main() {
  test('password baru: >= 10, beda dari lama & username, ulangi sama', () {
    const u = '16130.row01';
    expect(cekPasswordBaru('', 'Toboali-2026-Baru', 'Toboali-2026-Baru', u), 'Isi password lama.');
    expect(cekPasswordBaru('lama-lama-1', 'pendek', 'pendek', u), 'Password baru minimal 10 karakter.');
    expect(cekPasswordBaru('Sama-Persis-1', 'Sama-Persis-1', 'Sama-Persis-1', u), 'Password baru harus beda dari password lama.');
    expect(cekPasswordBaru('lama-lama-1', '16130.ROW01', '16130.ROW01', u), 'Password baru tidak boleh sama dengan username.');
    expect(cekPasswordBaru('lama-lama-1', 'Toboali-2026-Baru', 'Toboali-2026-Bar', u), 'Ulangi password baru belum sama.');
    expect(cekPasswordBaru('lama-lama-1', 'Toboali-2026-Baru', 'Toboali-2026-Baru', u), isNull);
  });
}
