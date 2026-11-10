import 'package:flutter/material.dart';

import '../../theme/app_colors.dart';
import '../hartek/hartek_gaya.dart';
import 'wo_bantu.dart';

/// Pilih tim tujuan + catatan. Hasil (timId, catatan) atau null = batal.
/// [tim] = daftar tim aktif (jawaban getWoAdmin). Dipakai layar Penerusan WO dan daftar Temuan Inspeksi.
Future<(String, String)?> pilihTimWo(BuildContext context, {required Map<String, dynamic> temuan, required List<Map<String, dynamic>> tim}) {
  final wo = petaWo(temuan['wo']);
  var pilih = teksWo(wo['timId']);
  final catatan = TextEditingController(text: teksWo(wo['catatanAdmin']));
  final grup = <String, List<Map<String, dynamic>>>{};
  for (final x in tim) {
    grup.putIfAbsent(teksWo(x['jenis']), () => []).add(x);
  }
  return showModalBottomSheet<(String, String)>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (c) => StatefulBuilder(
      builder: (c, setSheet) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(c).bottom),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(c).height * .85),
          child: ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(20, 0, 20, 20), children: [
            Text(teksWo(wo['status']) == StatusWo.terkirim ? 'Pindah WO ke tim lain' : 'Teruskan WO ke tim',
                style: HartekGaya.judulSeksi),
            const SizedBox(height: 4),
            Text('${teksWo(temuan['kodeTemuan'])} · ${teksWo(temuan['jenisTemuan'])}\n${lokasiTemuanWo(temuan)}', style: HartekGaya.sekunder),
            if (tim.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 16),
                child: Text('Belum ada tim ROW / Hartek / Yandal yang aktif di db_Tim.', style: HartekGaya.sekunder),
              ),
            for (final g in grup.entries) ...[
              const SizedBox(height: 14),
              Text(g.key == 'ROW' ? 'Tim ROW' : g.key == 'HARTEK' ? 'Tim Hartek' : g.key == 'YANDAL' ? 'Tim Yandal' : g.key,
                  style: const TextStyle(fontSize: 11.5, letterSpacing: 1, fontWeight: FontWeight.w900, color: AppColors.cyan600)),
              for (final x in g.value)
                ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                  leading: Icon(pilih == teksWo(x['timId']) ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded,
                      color: pilih == teksWo(x['timId']) ? HartekGaya.merek : AppColors.neutral400),
                  title: Text(teksWo(x['nama']), style: const TextStyle(fontWeight: FontWeight.w700)), // v1.0.15: tanpa kode tim
                  onTap: () => setSheet(() => pilih = teksWo(x['timId'])),
                ),
            ],
            const SizedBox(height: 12),
            TextField(
              controller: catatan,
              onChanged: (_) => setSheet(() {}),
              maxLength: 300,
              maxLines: 3,
              minLines: 1,
              decoration: const InputDecoration(labelText: 'Catatan untuk tim (opsional)', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 8),
            FilledButton.icon(
              onPressed: pilih.isEmpty || (pilih == teksWo(wo['timId']) && catatan.text.trim() == teksWo(wo['catatanAdmin']))
                  ? null
                  : () => Navigator.pop(c, (pilih, catatan.text.trim())),
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
              icon: const Icon(Icons.send_rounded),
              label: const Text('Kirim WO'),
            ),
          ]),
        ),
      ),
    ),
  ).whenComplete(() => Future<void>.delayed(const Duration(milliseconds: 500), catatan.dispose)); // tunggu animasi tutup
}
