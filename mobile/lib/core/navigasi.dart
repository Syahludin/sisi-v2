import 'package:flutter/widgets.dart';

/// v1.0.20 (permintaan kvlar 23 Okt 2026): tiap tab dashboard punya navigator sendiri sehingga bottom bar (menu,
/// Beranda, Pengaturan) tetap tampil di halaman rincian. FORM dibuka di navigator akar lewat [bukaForm] supaya menutupi
/// bottom bar (form layar penuh, tombol simpan di bawah tidak tertimpa). Bentuk sama dengan Navigator.push.
Future<T?> bukaForm<T extends Object?>(BuildContext context, Route<T> route) =>
    Navigator.of(context, rootNavigator: true).push<T>(route);
