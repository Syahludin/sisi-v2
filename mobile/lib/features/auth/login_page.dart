import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/env.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';

/// PRD Alur B: login -> getMaster -> (getKodeRow, menyusul) -> beranda.
class LoginPage extends StatefulWidget {
  const LoginPage({super.key, required this.deps, required this.onMasuk});
  final Deps deps;
  final void Function(Sesi) onMasuk;

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _username = TextEditingController();
  final _password = TextEditingController();
  bool _proses = false;
  String? _pesan;

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _masuk() async {
    setState(() {
      _proses = true;
      _pesan = null;
    });
    try {
      final s = await widget.deps.auth.login(_username.text, _password.text);
      await widget.deps.master.segarkan(s);
      // TODO(getKodeRow): wajib tarik kode hari ini sebelum input ROW (PRD F-ROW-INPUT).
      if (!mounted) return;
      widget.onMasuk(s);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _pesan = KodeError.pesan(e.kode));
    } catch (_) {
      if (!mounted) return;
      setState(() => _pesan = 'Tidak bisa terhubung. Cek sinyal.');
    } finally {
      if (mounted) setState(() => _proses = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(Env.isStaging ? 'SiSi ROW (STAGING)' : 'SiSi ROW')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _username,
              decoration: const InputDecoration(labelText: 'Username (16130.xxx)'),
              autocorrect: false,
              enableSuggestions: false,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _password,
              decoration: const InputDecoration(labelText: 'Password'),
              obscureText: true,
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _proses ? null : _masuk,
              child: Text(_proses ? 'Memproses...' : 'Masuk'),
            ),
            if (_pesan != null) ...[
              const SizedBox(height: 16),
              Text(_pesan!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
          ],
        ),
      ),
    );
  }
}
