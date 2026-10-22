import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/deps.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/sisi_widgets.dart';
import 'perbaikan_repository.dart';
import 'row_repository.dart';

/// M4 (v0.62): menu titik tiga di app bar detail header / penyulang / eksekusi.
class MenuDataRow extends StatelessWidget {
  const MenuDataRow({
    super.key,
    required this.labelBatal,
    required this.bisaBatal,
    required this.bisaUrungkan,
    required this.onBatal,
    required this.onUrungkan,
  });
  final String labelBatal;
  final bool bisaBatal;
  final bool bisaUrungkan;
  final VoidCallback onBatal;
  final VoidCallback onUrungkan;

  @override
  Widget build(BuildContext context) {
    if (!bisaBatal && !bisaUrungkan) return const SizedBox.shrink();
    return PopupMenuButton<String>(
      icon: const Icon(Icons.more_vert_rounded),
      onSelected: (v) => v == 'batal' ? onBatal() : onUrungkan(),
      itemBuilder: (_) => [
        if (bisaBatal)
          PopupMenuItem(
            value: 'batal',
            child: Row(children: [
              const Icon(Icons.block_rounded, color: AppColors.red700, size: 20),
              const SizedBox(width: 10),
              Text(labelBatal, style: const TextStyle(color: AppColors.red700, fontWeight: FontWeight.w700)),
            ]),
          ),
        if (bisaUrungkan)
          const PopupMenuItem(
            value: 'urungkan',
            child: Row(children: [
              Icon(Icons.undo_rounded, color: AppColors.navy700, size: 20),
              SizedBox(width: 10),
              Text('Urungkan pembatalan', style: TextStyle(fontWeight: FontWeight.w700)),
            ]),
          ),
      ],
    );
  }
}

/// Konfirmasi + alasan, lalu Hapus / Batal berantai. Hasil: null = tidak jadi / gagal,
/// true = data sudah dihapus dari HP (layar sebaiknya ditutup), false = data jadi BATAL (menunggu terkirim).
Future<bool?> batalkanRow(BuildContext context, Deps deps, Sesi s,
    {required String jenis, required String id, required String label}) async {
  final rencana = await deps.perbaikan.rencanaBatal(s.userId, jenis, id);
  if (!context.mounted) return null;
  final pilih = await showDialog<({String alasan, String? catatan})>(
    context: context,
    builder: (_) => _DialogBatal(label: label, rencana: rencana),
  );
  if (pilih == null || !context.mounted) return null;
  try {
    final h = await deps.syncCtl.tanpaSync(() => deps.perbaikan.batalkan(s, jenis, id, alasan: pilih.alasan, catatan: pilih.catatan));
    if (!context.mounted) return null;
    tampilPesan(
        context,
        h.dibatalkan == 0
            ? 'Dihapus dari HP: ${h.ringkas}.'
            : 'Dibatalkan: ${h.ringkas}. ${deps.syncCtl.online == true ? 'Sedang dikirim.' : 'Terkirim otomatis saat online.'}');
    unawaited(deps.syncCtl.sinkron());
    return h.dibatalkan == 0;
  } on RowError catch (e) {
    if (context.mounted) tampilPesan(context, e.pesan);
  } on StateError catch (e) {
    if (context.mounted) tampilPesan(context, e.message);
  }
  return null;
}

Future<void> urungkanBatalRow(BuildContext context, Deps deps, Sesi s, {required String jenis, required String id}) async {
  try {
    final n = await deps.syncCtl.tanpaSync(() => deps.perbaikan.urungkan(s, jenis, id));
    if (context.mounted) tampilPesan(context, 'Pembatalan diurungkan ($n data aktif lagi).');
  } on RowError catch (e) {
    if (context.mounted) tampilPesan(context, e.pesan);
  } on StateError catch (e) {
    if (context.mounted) tampilPesan(context, e.message);
  }
}

class _DialogBatal extends StatefulWidget {
  const _DialogBatal({required this.label, required this.rencana});
  final String label;
  final RencanaBatal rencana;

  @override
  State<_DialogBatal> createState() => _DialogBatalState();
}

class _DialogBatalState extends State<_DialogBatal> {
  String? _alasan;
  final _catatan = TextEditingController();

  @override
  void dispose() {
    _catatan.dispose();
    super.dispose();
  }

  bool get _siap => _alasan != null && (_alasan != 'LAINNYA' || _catatan.text.trim().isNotEmpty);

  @override
  Widget build(BuildContext context) {
    final r = widget.rencana;
    final semuaLokal = r.dibatalkan == 0;
    return AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      title: Text(semuaLokal ? 'Hapus ${widget.label}?' : 'Batalkan ${widget.label}?',
          style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.navy900)),
      content: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Yang terdampak: ${r.ringkas}.', style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          if (r.dihapus > 0)
            Text('${r.dihapus} data belum pernah terkirim, langsung dihapus dari HP (tidak bisa diurungkan).',
                style: const TextStyle(fontSize: 12.5, color: AppColors.neutral700)),
          if (r.dibatalkan > 0)
            Text('${r.dibatalkan} data sudah di server, dicatat BATAL. Nomornya tidak dipakai lagi.',
                style: const TextStyle(fontSize: 12.5, color: AppColors.neutral700)),
          const SizedBox(height: 12),
          const Text('Alasan', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.neutral500)),
          for (final e in alasanBatalRow.entries)
            ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              visualDensity: VisualDensity.compact,
              leading: Icon(_alasan == e.key ? Icons.radio_button_checked_rounded : Icons.radio_button_unchecked_rounded,
                  color: _alasan == e.key ? AppColors.navy700 : AppColors.neutral400),
              title: Text(e.value, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
              onTap: () => setState(() => _alasan = e.key),
            ),
          if (_alasan != null) ...[
            const SizedBox(height: 6),
            TextField(
              controller: _catatan,
              maxLength: 100,
              onChanged: (_) => setState(() {}),
              decoration: sisiInput(_alasan == 'LAINNYA' ? 'Catatan (wajib)' : 'Catatan (opsional)'),
            ),
          ],
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Kembali')),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: AppColors.red600, foregroundColor: Colors.white),
          onPressed: _siap ? () => Navigator.pop(context, (alasan: _alasan!, catatan: _catatan.text.trim())) : null,
          child: Text(semuaLokal ? 'Hapus' : 'Batalkan'),
        ),
      ],
    );
  }
}
