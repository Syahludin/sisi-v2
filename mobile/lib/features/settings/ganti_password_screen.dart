import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/sisi_widgets.dart';
import '../../widgets/sisi_loader.dart';

/// v0.67.0 (keputusan Master Guswan 9 Okt 2026): Ganti Password pemilik akun (Pengaturan). Wajib online.
/// Password lama wajib benar; baru minimal 10 karakter, beda dari lama dan username. Sukses = HP lain yang login
/// dengan akun ini dikeluarkan (HP ini tetap masuk). Akun tim YANDAL tidak bisa (dipakai bergantian, lewat admin).
class GantiPasswordScreen extends StatefulWidget {
  const GantiPasswordScreen({super.key, required this.deps, required this.sesi});
  final Deps deps;
  final Sesi sesi;

  @override
  State<GantiPasswordScreen> createState() => _GantiPasswordScreenState();
}

/// Alasan password baru belum bisa dipakai (null = boleh). Dicek lagi di server.
String? cekPasswordBaru(String lama, String baru, String ulang, String username) {
  if (lama.isEmpty) return 'Isi password lama.';
  if (baru.length < 10) return 'Password baru minimal 10 karakter.';
  if (baru == lama) return 'Password baru harus beda dari password lama.';
  if (baru.trim().toLowerCase() == username.trim().toLowerCase()) return 'Password baru tidak boleh sama dengan username.';
  if (baru != ulang) return 'Ulangi password baru belum sama.';
  return null;
}

class _GantiPasswordScreenState extends State<GantiPasswordScreen> {
  final _lama = TextEditingController(), _baru = TextEditingController(), _ulang = TextEditingController();
  bool _lihat = false;
  bool _proses = false;
  String? _galat;

  @override
  void dispose() {
    for (final c in [_lama, _baru, _ulang]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _simpan() async {
    final alasan = cekPasswordBaru(_lama.text, _baru.text, _ulang.text, widget.sesi.username);
    if (alasan != null) {
      setState(() => _galat = alasan);
      return;
    }
    setState(() {
      _proses = true;
      _galat = null;
    });
    try {
      final d = await widget.deps.api.call('gantiPassword',
          token: widget.sesi.token, data: {'passwordLama': _lama.text, 'passwordBaru': _baru.text});
      if (!mounted) return;
      final n = (d['sesiLainDicabut'] as num?)?.toInt() ?? 0;
      tampilPesan(context, n > 0 ? 'Password diganti. $n HP lain dengan akun ini dikeluarkan.' : 'Password diganti.');
      Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = KodeError.pesan(e.kode));
    } catch (_) {
      if (mounted) setState(() => _galat = 'Gagal tersambung ke server. Ganti password perlu internet.');
    } finally {
      if (mounted) setState(() => _proses = false);
    }
  }

  Widget _kolom(TextEditingController c, String label, {TextInputAction aksi = TextInputAction.next}) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextField(
          controller: c,
          obscureText: !_lihat,
          enableSuggestions: false,
          autocorrect: false,
          textInputAction: aksi,
          onChanged: (_) {
            if (_galat != null) setState(() => _galat = null);
          },
          onSubmitted: aksi == TextInputAction.done ? (_) => unawaited(_simpan()) : null,
          decoration: sisiInput(label).copyWith(prefixIcon: const Icon(Icons.lock_outline_rounded)),
        ),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF6F8FC),
      appBar: sisiAppBar('Ganti Password', subjudul: widget.sesi.username),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 40), children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: AppColors.cyan100, borderRadius: BorderRadius.circular(14)),
          child: const Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(Icons.info_outline_rounded, size: 18, color: AppColors.navy700),
            SizedBox(width: 8),
            Expanded(
              child: Text('Minimal 10 karakter, beda dari password lama. HP lain yang login dengan akun ini akan dikeluarkan.',
                  style: TextStyle(fontSize: 12, color: AppColors.navy900, height: 1.35)),
            ),
          ]),
        ),
        const SizedBox(height: 16),
        _kolom(_lama, 'Password lama'),
        _kolom(_baru, 'Password baru'),
        _kolom(_ulang, 'Ulangi password baru', aksi: TextInputAction.done),
        Row(children: [
          Checkbox(value: _lihat, onChanged: (v) => setState(() => _lihat = v ?? false)),
          const Text('Tampilkan password', style: TextStyle(fontSize: 13, color: AppColors.neutral700)),
        ]),
        if (_galat != null)
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: AppColors.red100, borderRadius: BorderRadius.circular(12)),
            child: Text(_galat!, style: const TextStyle(fontSize: 12.5, color: AppColors.red700, fontWeight: FontWeight.w600)),
          ),
        SizedBox(
          height: 50,
          child: FilledButton.icon(
            onPressed: _proses ? null : () => unawaited(_simpan()),
            icon: _proses
                ? const SisiLoader(ukuran: 18, warna: Colors.white)
                : const Icon(Icons.key_rounded),
            label: const Text('Simpan password baru'),
          ),
        ),
      ]),
    );
  }
}
