import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/sisi_loader.dart';
import '../../widgets/sisi_widgets.dart';
import 'p0_model.dart';

/// v1.0.50 referensi P0 di Command Center (tab P0_PENUGASAN), dari requestP0Cc / getStatusP0Cc.
class StatusCc {
  const StatusCc({required this.noP0, required this.status, this.approvedBy = '', this.waktuMulai = '', this.update = ''});
  final String noP0;
  final String status;
  final String approvedBy;
  final String waktuMulai;
  final String update;

  static StatusCc dariJson(Map<String, dynamic> j) => StatusCc(
        noP0: '${j['noP0'] ?? ''}',
        status: '${j['status'] ?? ''}',
        approvedBy: '${j['approvedBy'] ?? ''}',
        waktuMulai: '${j['waktuMulai'] ?? ''}',
        update: '${j['update'] ?? ''}',
      );
}

/// v1.0.50 card Command Center di detail P0: P0 yang sudah tersimpan di server bisa di-request SEKALI ke Command Center,
/// sesudahnya menampilkan status yang dibaca balik (butuh sinyal; tidak disimpan di HP).
class P0CcPanel extends StatefulWidget {
  const P0CcPanel({super.key, required this.api, required this.sesi, required this.p0});
  final ApiClient api;
  final Sesi sesi;
  final P0Lokal p0;

  @override
  State<P0CcPanel> createState() => _P0CcPanelState();
}

class _P0CcPanelState extends State<P0CcPanel> {
  StatusCc? _cc;
  bool _muat = false;
  bool _kirim = false;
  String _galat = '';

  bool get _diServer => widget.p0.kodeResmi.isNotEmpty;

  @override
  void initState() {
    super.initState();
    if (_diServer) unawaited(_status());
  }

  @override
  void didUpdateWidget(P0CcPanel lama) {
    super.didUpdateWidget(lama);
    if (!lama.p0.kodeResmi.isNotEmpty && _diServer) unawaited(_status());
  }

  Future<void> _status() async {
    setState(() {
      _muat = true;
      _galat = '';
    });
    try {
      final d = await widget.api.call('getStatusP0Cc', token: widget.sesi.token, data: {
        'p0Ids': [widget.p0.id]
      });
      final daftar = (d['p0'] as List? ?? const []).whereType<Map<String, dynamic>>();
      if (mounted) setState(() => _cc = daftar.isEmpty ? null : StatusCc.dariJson(daftar.first));
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = KodeError.pesan(e.kode));
    } finally {
      if (mounted) setState(() => _muat = false);
    }
  }

  Future<void> _request() async {
    final ya = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Request ke Command Center?'),
        content: Text('${widget.p0.kodeTampil} (${widget.p0.namaTampil}) dikirim ke Command Center sebagai permintaan '
            'penugasan berstatus Open. Hanya bisa sekali.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Request')),
        ],
      ),
    );
    if (ya != true || !mounted) return;
    setState(() => _kirim = true);
    try {
      final d = await widget.api.call('requestP0Cc', token: widget.sesi.token, data: {'p0Id': widget.p0.id});
      if (!mounted) return;
      setState(() => _cc = StatusCc.dariJson(d));
      tampilPesan(context, 'Terkirim ke Command Center (${_cc!.noP0}).');
    } on ApiException catch (e) {
      if (mounted) tampilPesan(context, KodeError.pesan(e.kode));
    } finally {
      if (mounted) setState(() => _kirim = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cc = _cc;
    Widget baris(String k, String v) => Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SizedBox(width: 120, child: Text(k, style: const TextStyle(fontSize: 12.5, color: AppColors.neutral500))),
            Expanded(child: Text(v.isEmpty ? '-' : v, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.navy900))),
          ]),
        );
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.neutral200)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          const Expanded(child: Text('Command Center', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.navy900))),
          if (_diServer && !_muat)
            IconButton(
              tooltip: 'Muat ulang status',
              visualDensity: VisualDensity.compact,
              onPressed: _kirim ? null : () => unawaited(_status()),
              icon: const Icon(Icons.refresh_rounded, size: 20),
            ),
        ]),
        const SizedBox(height: 6),
        if (!_diServer)
          const Text('P0 harus terkirim ke server dulu sebelum bisa di-request.', style: TextStyle(fontSize: 12.5, color: AppColors.neutral500))
        else if (_muat)
          const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: Center(child: SisiLoader()))
        else if (_galat.isNotEmpty)
          Text(_galat, style: const TextStyle(fontSize: 12.5, color: AppColors.accent700))
        else if (cc != null) ...[
          baris('No P0 CC', cc.noP0),
          baris('Status', cc.status),
          baris('Disetujui', cc.approvedBy),
          baris('Mulai', cc.waktuMulai),
          baris('Update', cc.update),
        ] else
          FilledButton.icon(
            onPressed: _kirim ? null : () => unawaited(_request()),
            icon: _kirim ? const SizedBox(width: 18, height: 18, child: SisiLoader(ukuran: 18)) : const Icon(Icons.send_rounded, size: 18),
            label: const Text('Request ke Command Center'),
          ),
      ]),
    );
  }
}
