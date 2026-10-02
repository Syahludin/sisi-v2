import 'package:flutter/material.dart';

import '../../core/deps.dart';
import '../../core/sesi.dart';

/// Placeholder input ROW. Layar Header -> PNY -> EKS dibuat setelah
/// jalur input ROW di PRD bagian 9 diputuskan. Klasifikasi diameter: jenis_pekerjaan.dart.
class RowHomePage extends StatelessWidget {
  const RowHomePage({super.key, required this.deps, required this.sesi});
  final Deps deps;
  final Sesi sesi;

  @override
  Widget build(BuildContext context) {
    final bolehUbah = sesi.bisaUbah('ROW_EKSEKUSI');
    final bolehInput = bolehUbah && sesi.bolehInput(DateTime.now());
    return Scaffold(
      appBar: AppBar(title: const Text('Eksekusi ROW')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            bolehInput
                ? 'Form input ROW menyusul (lihat PRD F-ROW-INPUT).'
                : 'Input dikunci: tidak punya akses UBAH atau batas offline lewat.',
            textAlign: TextAlign.center,
          ),
        ),
      ),
    );
  }
}
