import 'package:flutter/material.dart';

import 'app.dart';
import 'core/deps.dart';
import 'core/env.dart';

Future<void> main() async {
  Env.pastikanValid(); // gagal di sini = build salah env, jangan lanjut
  WidgetsFlutterBinding.ensureInitialized();
  final deps = await Deps.siapkan();
  runApp(SisiApp(deps: deps));
}
