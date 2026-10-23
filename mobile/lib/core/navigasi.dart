import 'package:flutter/widgets.dart';

import 'kunci_update.dart';

/// v1.0.20 (permintaan kvlar 23 Okt 2026): tiap tab dashboard punya navigator sendiri sehingga bottom bar (menu,
/// Beranda, Pengaturan) tetap tampil di halaman rincian. FORM dibuka di navigator akar lewat [bukaForm] supaya menutupi
/// bottom bar (form layar penuh, tombol simpan di bawah tidak tertimpa). Bentuk sama dengan Navigator.push.
/// v1.0.22: aplikasi wajib update (kartu update ditutup) = form tidak dibuka, kartu pemberitahuan update tampil.
Future<T?> bukaForm<T extends Object?>(BuildContext context, Route<T> route) {
  if (KunciUpdate.tolak(context)) return Future<T?>.value();
  return Navigator.of(context, rootNavigator: true).push<T>(route);
}
