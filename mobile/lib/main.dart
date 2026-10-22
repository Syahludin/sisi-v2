import 'package:flutter/material.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'app.dart';
import 'core/deps.dart';
import 'core/env.dart';
import 'core/sinkron_latar.dart';

Future<void> main() async {
  Env.pastikanValid(); // gagal di sini = build salah env, jangan lanjut
  WidgetsFlutterBinding.ensureInitialized();
  SinkronLatar.siapkan(); // v1.0.12: layanan sinkron latar (Android)
  await initializeDateFormatting('id_ID');
  final deps = await Deps.siapkan();
  runApp(SisiApp(deps: deps));
}
