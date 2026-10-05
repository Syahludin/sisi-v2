import 'package:flutter/material.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'app.dart';
import 'core/deps.dart';
import 'core/env.dart';

Future<void> main() async {
  Env.pastikanValid(); // gagal di sini = build salah env, jangan lanjut
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('id_ID');
  final deps = await Deps.siapkan();
  runApp(SisiApp(deps: deps));
}
