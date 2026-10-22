import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import 'sisi_widgets.dart';

/// Satu pilihan di [KolomPilih]: nilai (mis. section_id) + teks tampilan.
class PilihanItem {
  const PilihanItem(this.nilai, this.label);
  final String nilai;
  final String label;
}

/// v0.61: pengganti DropdownButtonFormField untuk daftar panjang (section). Dropdown bawaan memotong daftar
/// panjang dan membuka di posisi item terpilih, jadi section di bawah / di atas tidak kelihatan.
/// Ketuk = bottom sheet setinggi maks 85% layar, bisa digulir, kolom cari kalau isi > 8,
/// urutan daftar dipertahankan apa adanya (section: kolom urutan db_Jaringan, PMT -> ujung), nomor urut di kiri.
/// Nilai dari luar berubah = beri key baru (mis. ValueKey dari daftar + nilai).
class KolomPilih extends FormField<String> {
  KolomPilih({
    super.key,
    required String label,
    required List<PilihanItem> pilihan,
    String? nilaiAwal,
    ValueChanged<String>? onChanged,
    super.validator,
    String? judulSheet,
    String? keteranganSheet,
    bool bernomor = false,
    bool selaluCari = false, // v0.64.7: kolom cari selalu tampil (mis. nama pekerjaan P0)
  }) : super(
          initialValue: nilaiAwal,
          builder: (state) {
            final cocok = pilihan.where((p) => p.nilai == state.value).toList();
            final teks = cocok.isEmpty ? null : cocok.first.label;
            final no = cocok.isEmpty ? 0 : pilihan.indexOf(cocok.first) + 1;
            return InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: pilihan.isEmpty
                  ? null
                  : () async {
                      final v = await bukaPilihan(
                        state.context,
                        judul: judulSheet ?? label,
                        keterangan: keteranganSheet,
                        pilihan: pilihan,
                        terpilih: state.value,
                        bernomor: bernomor,
                        selaluCari: selaluCari,
                      );
                      if (v == null) return;
                      state.didChange(v);
                      onChanged?.call(v);
                    },
              child: InputDecorator(
                isEmpty: teks == null,
                decoration: sisiInput(label, suffix: const Icon(Icons.expand_more_rounded, color: AppColors.neutral500))
                    .copyWith(errorText: state.errorText),
                child: Text(
                  teks == null ? '' : (bernomor ? '$no. $teks' : teks),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.navy900),
                ),
              ),
            );
          },
        );
}

/// Bottom sheet pilih satu dari daftar. Hasil = nilai yang dipilih, atau null kalau ditutup.
Future<String?> bukaPilihan(
  BuildContext context, {
  required String judul,
  required List<PilihanItem> pilihan,
  String? terpilih,
  String? keterangan,
  bool bernomor = false,
  bool selaluCari = false,
}) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (c) => _SheetPilih(
        judul: judul, keterangan: keterangan, pilihan: pilihan, terpilih: terpilih, bernomor: bernomor, selaluCari: selaluCari),
  );
}

class _SheetPilih extends StatefulWidget {
  const _SheetPilih(
      {required this.judul, required this.pilihan, this.terpilih, this.keterangan, this.bernomor = false, this.selaluCari = false});
  final String judul;
  final String? keterangan;
  final List<PilihanItem> pilihan;
  final String? terpilih;
  final bool bernomor;
  final bool selaluCari;

  @override
  State<_SheetPilih> createState() => _SheetPilihState();
}

class _SheetPilihState extends State<_SheetPilih> {
  String _cari = '';

  @override
  Widget build(BuildContext context) {
    final q = _cari.trim().toLowerCase();
    final daftar = <({int no, PilihanItem p})>[
      for (var i = 0; i < widget.pilihan.length; i++)
        if (q.isEmpty || widget.pilihan[i].label.toLowerCase().contains(q)) (no: i + 1, p: widget.pilihan[i]),
    ];
    final mq = MediaQuery.of(context);
    return Padding(
      padding: EdgeInsets.only(bottom: mq.viewInsets.bottom),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: mq.size.height * .85),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const SizedBox(height: 10),
          Center(
            child: Container(width: 40, height: 4, decoration: BoxDecoration(color: AppColors.neutral300, borderRadius: BorderRadius.circular(4))),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 2),
            child: Text(widget.judul, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.navy900)),
          ),
          if (widget.keterangan != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 2),
              child: Text(widget.keterangan!, style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
            ),
          if (widget.selaluCari || widget.pilihan.length > 8)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 4),
              child: TextField(
                onChanged: (v) => setState(() => _cari = v),
                textInputAction: TextInputAction.search,
                decoration: sisiInput('Cari', suffix: const Icon(Icons.search_rounded, color: AppColors.neutral500)),
              ),
            ),
          Flexible(
            child: daftar.isEmpty
                ? const Padding(
                    padding: EdgeInsets.all(24),
                    child: Text('Tidak ada yang cocok.', textAlign: TextAlign.center, style: TextStyle(color: AppColors.neutral500)),
                  )
                : ListView.separated(
                    shrinkWrap: true,
                    padding: const EdgeInsets.fromLTRB(8, 6, 8, 16),
                    itemCount: daftar.length,
                    separatorBuilder: (c, i) => const Divider(height: 1, color: AppColors.neutral100),
                    itemBuilder: (c, i) {
                      final x = daftar[i];
                      final pilih = x.p.nilai == widget.terpilih;
                      return ListTile(
                        selected: pilih,
                        selectedTileColor: AppColors.cyan100,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        leading: widget.bernomor
                            ? SizedBox(
                                width: 28,
                                child: Text('${x.no}',
                                    textAlign: TextAlign.right,
                                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.neutral500)),
                              )
                            : null,
                        minLeadingWidth: 28,
                        title: Text(x.p.label,
                            style: TextStyle(fontSize: 14, fontWeight: pilih ? FontWeight.w800 : FontWeight.w600, color: AppColors.navy900)),
                        trailing: pilih ? const Icon(Icons.check_rounded, color: AppColors.cyan600) : null,
                        onTap: () => Navigator.pop(context, x.p.nilai),
                      );
                    },
                  ),
          ),
        ]),
      ),
    );
  }
}
