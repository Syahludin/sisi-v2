import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../row/row_home_page.dart';

/// Beranda. PRD Alur A (cekSesi + getMaster saat online), Alur D (sesi habis), Alur G (logout).
class HomePage extends StatefulWidget {
  const HomePage({super.key, required this.deps, required this.sesi, required this.onSesiBerubah});
  final Deps deps;
  final Sesi sesi;
  final void Function(Sesi?) onSesiBerubah;

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  String? _info;
  int _belumTerkirim = 0;

  Sesi get _sesi => widget.sesi;

  @override
  void initState() {
    super.initState();
    _segarkan();
  }

  Future<void> _segarkan() async {
    try {
      final baru = await widget.deps.auth.cekSesi(_sesi);
      await widget.deps.master.segarkan(baru);
      widget.onSesiBerubah(baru);
    } on ApiException catch (e) {
      if (KodeError.sesiHabis.contains(e.kode)) {
        widget.onSesiBerubah(null); // ke login, outbox tetap
        return;
      }
      _setInfo(KodeError.pesan(e.kode));
    } catch (_) {
      _setInfo('Mode offline.');
    }
    await _hitungOutbox();
  }

  Future<void> _hitungOutbox() async {
    final n = await widget.deps.outbox.jumlahBelumTerkirim(_sesi.userId);
    if (mounted) setState(() => _belumTerkirim = n);
  }

  void _setInfo(String s) {
    if (mounted) setState(() => _info = s);
  }

  Future<void> _sync() async {
    try {
      final h = await widget.deps.sync.kirim(_sesi);
      _setInfo(h.catatan ?? 'Terkirim ${h.terkirim}, konflik ${h.konflik}, ditolak ${h.ditolak}.');
    } on ApiException catch (e) {
      if (KodeError.sesiHabis.contains(e.kode)) {
        widget.onSesiBerubah(null);
        return;
      }
      _setInfo(KodeError.pesan(e.kode));
    } catch (_) {
      _setInfo('Gagal sync. Data tetap aman di HP.');
    }
    await _hitungOutbox();
  }

  Future<void> _logout() async {
    await _hitungOutbox();
    if (!mounted) return;
    if (_belumTerkirim > 0) {
      // Keputusan 2 Okt 2026: logout DITOLAK selama masih ada data belum terkirim.
      await showDialog<void>(
        context: context,
        builder: (c) => AlertDialog(
          title: const Text('Belum bisa logout'),
          content: Text('$_belumTerkirim data belum terkirim. Sync dulu sampai semua terkirim, baru logout.'),
          actions: [TextButton(onPressed: () => Navigator.pop(c), child: const Text('Oke'))],
        ),
      );
      return;
    }
    await widget.deps.auth.logout(_sesi);
    widget.onSesiBerubah(null);
  }

  @override
  Widget build(BuildContext context) {
    final bolehInput = _sesi.bolehInput(DateTime.now());
    return Scaffold(
      appBar: AppBar(
        title: Text(_sesi.nama),
        actions: [IconButton(onPressed: _logout, icon: const Icon(Icons.logout), tooltip: 'Logout')],
      ),
      body: RefreshIndicator(
        onRefresh: _segarkan,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('${_sesi.role} · tim ${_sesi.timKode}'),
            Text('Offline sampai: ${_sesi.offlineSampai.toLocal()}'),
            if (!bolehInput)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text('Batas offline lewat. Sambungkan internet untuk lanjut input.'),
              ),
            const SizedBox(height: 16),
            Text('Belum terkirim: $_belumTerkirim'),
            if (_info != null) Text(_info!),
            const SizedBox(height: 16),
            if (_sesi.aksiMenu('ROW_EKSEKUSI') != null)
              FilledButton(
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute<void>(builder: (_) => RowHomePage(deps: widget.deps, sesi: _sesi)),
                ),
                child: const Text('Eksekusi ROW'),
              ),
            const SizedBox(height: 8),
            OutlinedButton(onPressed: _sync, child: const Text('Sync sekarang')),
          ],
        ),
      ),
    );
  }
}
