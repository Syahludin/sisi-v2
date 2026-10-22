import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// v1.0.17: warna kategori titik kalender, urutan tetap (validate_palette.js light: lulus; kontras aqua < 3:1 =
/// selalu didampingi legenda berlabel + daftar rincian hari).
class WarnaKalender {
  WarnaKalender._();
  static const pekerjaan = Color(0xFF2A78D6); // slot 1 biru: pekerjaan / laporan tim
  static const padam = Color(0xFFEB6834); // slot 2 oranye: jadwal padam
  static const wo = Color(0xFF1BAF7A); // slot 3 aqua: WO tindak lanjut
  static const inspeksi = Color(0xFF6250D6); // slot 4 ungu: temuan inspeksi
}

/// v1.0.17: penanda satu hari di kalender (warna titik + jumlah).
class TandaHari {
  const TandaHari(this.warna, this.jumlah, this.label);
  final Color warna;
  final int jumlah;
  final String label;
}

const _namaBulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const _namaHari = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

String isoHari(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

String labelBulan(DateTime bulan) => '${_namaBulan[bulan.month - 1]} ${bulan.year}';

/// v1.0.17 (permintaan kvlar 22 Okt 2026): kalender satu bulan (Senin di kiri), dipakai Jadwal Padam (admin) dan
/// Kalender tim. Tiap hari menampilkan titik berwarna per jenis kegiatan (maks 3) + jumlah; hari terpilih berlatar biru,
/// hari ini bercincin. Ketuk hari = [onPilih]; panah = ganti bulan ([onGantiBulan]).
class KalenderBulan extends StatelessWidget {
  const KalenderBulan({
    super.key,
    required this.bulan,
    required this.tanda,
    required this.dipilih,
    required this.onPilih,
    required this.onGantiBulan,
    this.hariIni,
    this.sibuk = false,
  });

  /// Hari pertama bulan yang ditampilkan.
  final DateTime bulan;

  /// 'yyyy-MM-dd' -> tanda.
  final Map<String, List<TandaHari>> tanda;
  final DateTime? dipilih, hariIni;
  final ValueChanged<DateTime> onPilih;
  final ValueChanged<DateTime> onGantiBulan;
  final bool sibuk;

  @override
  Widget build(BuildContext context) {
    final awal = DateTime(bulan.year, bulan.month, 1);
    final jumlahHari = DateTime(bulan.year, bulan.month + 1, 0).day;
    final geser = (awal.weekday + 6) % 7; // Senin = 0
    final sel = (geser + jumlahHari + 6) ~/ 7 * 7;
    final kini = hariIni;
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 8, 10, 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.neutral200),
        boxShadow: [BoxShadow(color: AppColors.navy900.withValues(alpha: .05), blurRadius: 12, offset: const Offset(0, 4))],
      ),
      child: Column(children: [
        Row(children: [
          IconButton(
            tooltip: 'Bulan sebelumnya',
            onPressed: sibuk ? null : () => onGantiBulan(DateTime(bulan.year, bulan.month - 1, 1)),
            icon: const Icon(Icons.chevron_left_rounded),
          ),
          Expanded(
            child: Text(labelBulan(bulan),
                textAlign: TextAlign.center, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: AppColors.navy900)),
          ),
          IconButton(
            tooltip: 'Bulan berikutnya',
            onPressed: sibuk ? null : () => onGantiBulan(DateTime(bulan.year, bulan.month + 1, 1)),
            icon: const Icon(Icons.chevron_right_rounded),
          ),
        ]),
        const SizedBox(height: 4),
        Row(children: [
          for (var i = 0; i < 7; i++)
            Expanded(
              child: Text(_namaHari[i],
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: i == 6 ? AppColors.red600 : AppColors.neutral500)),
            ),
        ]),
        const SizedBox(height: 6),
        for (var minggu = 0; minggu < sel ~/ 7; minggu++)
          Row(children: [
            for (var i = 0; i < 7; i++)
              Expanded(
                child: () {
                  final n = minggu * 7 + i - geser + 1;
                  if (n < 1 || n > jumlahHari) return const SizedBox(height: 52);
                  final d = DateTime(bulan.year, bulan.month, n);
                  final k = isoHari(d);
                  final t = tanda[k] ?? const <TandaHari>[];
                  final pilih = dipilih != null && isoHari(dipilih!) == k;
                  final iniHari = kini != null && isoHari(kini) == k;
                  final total = t.fold<int>(0, (a, x) => a + x.jumlah);
                  return Semantics(
                    button: true,
                    selected: pilih,
                    excludeSemantics: true, // label sudah memuat tanggal + kegiatan
                    label: '$n ${labelBulan(bulan)}${t.isEmpty ? ', tidak ada kegiatan' : ', ${[for (final x in t) '${x.jumlah} ${x.label}'].join(', ')}'}',
                    child: InkWell(
                      borderRadius: BorderRadius.circular(12),
                      onTap: () => onPilih(d),
                      child: Container(
                        height: 52,
                        margin: const EdgeInsets.all(2),
                        decoration: BoxDecoration(
                          color: pilih ? AppColors.navy700 : (t.isNotEmpty ? AppColors.brand50 : Colors.transparent),
                          borderRadius: BorderRadius.circular(12),
                          border: iniHari && !pilih ? Border.all(color: AppColors.cyan600, width: 1.6) : null,
                        ),
                        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                          Text('$n',
                              style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: t.isNotEmpty || pilih ? FontWeight.w800 : FontWeight.w500,
                                  color: pilih ? Colors.white : (i == 6 ? AppColors.red600 : AppColors.navy900))),
                          const SizedBox(height: 3),
                          if (t.isNotEmpty)
                            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                              for (final x in t.take(3))
                                Container(
                                  width: 7,
                                  height: 7,
                                  margin: const EdgeInsets.symmetric(horizontal: 1.5),
                                  decoration: BoxDecoration(
                                    color: x.warna,
                                    shape: BoxShape.circle,
                                    border: pilih ? Border.all(color: Colors.white, width: 1) : null,
                                  ),
                                ),
                              if (total > 1)
                                Padding(
                                  padding: const EdgeInsets.only(left: 2),
                                  child: Text('$total',
                                      style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, color: pilih ? Colors.white : AppColors.neutral700)),
                                ),
                            ])
                          else
                            const SizedBox(height: 7),
                        ]),
                      ),
                    ),
                  );
                }(),
              ),
          ]),
      ]),
    );
  }
}

/// Legenda warna tanda kalender (identitas tidak hanya dari warna: tiap butir berlabel).
class LegendaKalender extends StatelessWidget {
  const LegendaKalender({super.key, required this.butir});
  final List<(Color, String)> butir;

  @override
  Widget build(BuildContext context) => Wrap(spacing: 14, runSpacing: 6, children: [
        for (final (w, l) in butir)
          Row(mainAxisSize: MainAxisSize.min, children: [
            Container(width: 9, height: 9, decoration: BoxDecoration(color: w, shape: BoxShape.circle)),
            const SizedBox(width: 5),
            Text(l, style: const TextStyle(fontSize: 12, color: AppColors.neutral700)),
          ]),
      ]);
}
