import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../theme/app_colors.dart';
import '../hartek/hartek_gaya.dart';
import 'gangguan_bantu.dart';
import 'gangguan_grafik.dart';

/// v1.0.38 History Gangguan HP: kartu kejadian di daftar, lembar detail satu kejadian, lembar rincian penyulang Top 12.
/// Isi sama dengan website (web/src/pages/historiGangguan/Kejadian.jsx + TabTop.jsx Rincian).

const Map<String, List<(String, String)>> _barisDetail = {
  'penyulang': [
    ('No APKT', 'no_apkt'), ('Padam', 'waktu_padam'), ('Nyala', 'waktu_nyala'), ('Durasi', 'durasi_menit'), ('Status', 'status'),
    ('Indikasi', 'indikasi'), ('Arus sebelum trip', 'beban_a'), ('ENS', 'ens_kwh'), ('Pelanggan', 'pelanggan'),
    ('Pelanggan x durasi', 'pelanggan_x_durasi'), ('Pelanggan VIP', 'pelanggan_vip'), ('SCADA', 'scada'), ('Status SCADA', 'status_scada'),
    ('Cuaca', 'cuaca'), ('Kode FGTM', 'kode_fgtm'), ('Penyebab', 'penyebab'), ('Ket. penyebab', 'ket_penyebab'), ('Lokasi', 'lokasi'),
    ('Jumlah gardu', 'jumlah_gardu'), ('Daerah padam', 'daerah_padam'), ('Keterangan', 'keterangan'),
    ('Petugas P2D', 'petugas'), ('Pengawas', 'pengawas'),
  ],
  'ar': [
    ('Waktu AR', 'waktu_ar'), ('Indikasi', 'indikasi'), ('Arus sebelum trip', 'beban_a'), ('SCADA', 'scada'), ('Status SCADA', 'status_scada'),
    ('Cuaca', 'cuaca'), ('Kode FGTM', 'kode_fgtm'), ('Penyebab', 'penyebab'), ('Ket. penyebab', 'ket_penyebab'), ('Lokasi', 'lokasi'), ('Keterangan', 'keterangan'), ('Petugas P2D', 'petugas'), ('Pengawas', 'pengawas'),
  ],
  'pickup': [
    ('Waktu event', 'waktu_event'), ('Indikasi relay', 'indikasi_relay'), ('Fasa', 'fasa'), ('Tindak lanjut', 'waktu_tindak_lanjut'),
    ('Temuan', 'temuan'), ('Status', 'status'), ('Petugas eksekusi', 'petugas_eksekusi'), ('Koordinat temuan', 'koordinat_temuan'),
    ('Koordinat ujung', 'koordinat_ujung'),
  ],
};
const _fotoPickup = [('foto_arus', 'Arus pick up'), ('foto_ujung', 'Gardu ujung'), ('foto_temuan', 'Temuan'), ('foto_sesudah', 'Sesudah eksekusi')];

String _angka(num n) => n == n.roundToDouble() ? n.round().toString() : n.toStringAsFixed(1).replaceAll('.', ',');
String _ribuan(num n) => n.round().toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => '.');

String _nilai(String kunci, Object? v) {
  final n = angkaGgn(v);
  return switch (kunci) {
    'durasi_menit' => teksDurasiGgn(v),
    'beban_a' => n == null ? teksGgn(v) : '${_angka(n)} A',
    'ens_kwh' => n == null ? teksGgn(v) : '${_angka(n)} kWh',
    'pelanggan' || 'pelanggan_x_durasi' => n == null ? teksGgn(v) : _ribuan(n),
    _ => teksGgn(v),
  };
}

Widget _pil(String t, Color warna, Color latar) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: latar, borderRadius: BorderRadius.circular(999)),
      child: Text(t, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: warna)),
    );

Color warnaJenisGgn(String kode) => switch (kode) { 'ar' => AppColors.accent600, 'pickup' => AppColors.brand600, _ => AppColors.red600 };

/// Satu kejadian di daftar: tanggal, peralatan, penyulang, sebab, tanda (indikasi, durasi / status, FGTM, cuaca).
class KartuKejadianGgn extends StatelessWidget {
  const KartuKejadianGgn({super.key, required this.o, required this.jenis, required this.onTap});
  final Map<String, dynamic> o;
  final String jenis;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final j = jenisGgn(jenis);
    final w = RegExp(r'^(\d{4})-(\d{2})-(\d{2})(?: (\d{1,2}:\d{2}))?').firstMatch(teksGgn(o[j.waktu]));
    final sebab = teksGgn(o[j.sebab]);
    final kat = kategoriAlatGgn(o, jenis);
    final k = kodeFgtm(o['kode_fgtm']);
    final selesai = ['DONE', 'SELESAI'].contains(teksGgn(o['status']));
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.fromLTRB(10, 10, 12, 10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.neutral150),
            ),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(
                width: 48,
                padding: const EdgeInsets.symmetric(vertical: 6),
                decoration: BoxDecoration(color: warnaJenisGgn(jenis).withValues(alpha: .1), borderRadius: BorderRadius.circular(10)),
                child: Column(children: [
                  Text(w == null ? '?' : '${int.parse(w.group(3)!)}', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: warnaJenisGgn(jenis))),
                  Text(w == null ? '' : bulanPendekGgn[int.parse(w.group(2)!) - 1], style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.neutral700)),
                  if (w?.group(4) != null) Text(w!.group(4)!, style: const TextStyle(fontSize: 10, color: AppColors.neutral500)),
                ]),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Container(width: 8, height: 8, decoration: BoxDecoration(color: kat == 'pmt' ? WarnaGgn.pmt : WarnaGgn.section, borderRadius: BorderRadius.circular(2))),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(teksGgn(o[j.alat]).isEmpty ? '-' : teksGgn(o[j.alat]),
                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.brand950), overflow: TextOverflow.ellipsis),
                    ),
                  ]),
                  Text([teksGgn(o['penyulang']), teksGgn(o['jenis_peralatan']), if (jenis == 'pickup' && teksGgn(o['fasa']).isNotEmpty) 'fasa ${teksGgn(o['fasa'])}']
                      .where((x) => x.isNotEmpty).join(' · '),
                      style: const TextStyle(fontSize: 12, color: AppColors.neutral500)),
                  const SizedBox(height: 3),
                  Text(sebab.isNotEmpty ? sebab : (jenis == 'pickup' ? 'Temuan belum diisi' : 'Penyebab belum diketahui'),
                      maxLines: 2, overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 12.5, color: sebab.isNotEmpty ? AppColors.neutral900 : AppColors.neutral400, fontStyle: sebab.isNotEmpty ? null : FontStyle.italic)),
                  const SizedBox(height: 6),
                  Wrap(spacing: 5, runSpacing: 4, children: [
                    if (teksGgn(o['indikasi'] ?? o['indikasi_relay']).isNotEmpty) _pil(teksGgn(o['indikasi'] ?? o['indikasi_relay']), AppColors.neutral700, AppColors.neutral100),
                    if (jenis == 'penyulang') _pil(teksDurasiGgn(o['durasi_menit']), AppColors.red700, AppColors.red100),
                    if (jenis == 'pickup') _pil(teksGgn(o['status']).isEmpty ? 'BELUM' : teksGgn(o['status']), selesai ? AppColors.success700 : AppColors.accent700, selesai ? AppColors.success100 : AppColors.accent100),
                    if (jenis != 'pickup' && k.kode.isNotEmpty) _pil(k.kode, k.grup == 'INTERNAL' ? AppColors.brand800 : AppColors.success700, k.grup == 'INTERNAL' ? AppColors.brand100 : AppColors.success100),
                    if (teksGgn(o['cuaca']).isNotEmpty) _pil(teksGgn(o['cuaca']), AppColors.neutral700, AppColors.neutral100),
                  ]),
                ]),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

Future<void> _bukaUrl(BuildContext context, String url) async {
  final uri = Uri.tryParse(url);
  final ok = uri != null && await launchUrl(uri, mode: LaunchMode.externalApplication);
  if (!ok && context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Tautan tidak bisa dibuka.')));
}

/// Lembar detail satu kejadian.
Future<void> bukaDetailGgn(BuildContext context, Map<String, dynamic> o, String jenis) {
  final j = jenisGgn(jenis);
  bool ada(Object? v) => v != null && teksGgn(v).isNotEmpty;
  final koord = teksGgn(o['koordinat'] ?? o['koordinat_temuan']);
  final arus = ['arus_r', 'arus_s', 'arus_t', 'arus_n'];
  List<Map<String, dynamic>> tahap = const [];
  try {
    final v = o['nyala_bertahap'];
    tahap = daftarGgn(v is String && v.isNotEmpty ? jsonDecode(v) : v);
  } catch (_) {}
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (c) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: .8,
      maxChildSize: .95,
      builder: (c, gulir) => ListView(controller: gulir, padding: const EdgeInsets.fromLTRB(20, 0, 20, 24), children: [
        Text(teksGgn(o[j.alat]).isEmpty ? teksGgn(o['penyulang']) : teksGgn(o[j.alat]), style: HartekGaya.judulSeksi),
        Text('${j.label} · ${teksGgn(o['penyulang'])}', style: HartekGaya.sekunder),
        if (jenis != 'pickup' && arus.any((k) => ada(o[k]))) ...[
          const SizedBox(height: 12),
          Row(children: [
            for (final k in arus)
              Expanded(
                child: Container(
                  margin: const EdgeInsets.only(right: 6),
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  decoration: BoxDecoration(color: AppColors.neutral100, borderRadius: BorderRadius.circular(10)),
                  child: Column(children: [
                    Text(k.substring(k.length - 1).toUpperCase(), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.neutral500)),
                    Text(ada(o[k]) ? _nilai('', o[k]) : '-', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: AppColors.brand950)),
                  ]),
                ),
              ),
          ]),
        ],
        const SizedBox(height: 8),
        for (final (l, k) in _barisDetail[jenis]!)
          if (ada(o[k]))
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 5),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                SizedBox(width: 118, child: Text(l, style: const TextStyle(fontSize: 13, color: AppColors.neutral500))),
                Expanded(child: SelectableText(_nilai(k, o[k]), style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: AppColors.neutral900))),
              ]),
            ),
        if (jenis == 'penyulang' && tahap.isNotEmpty) ...[
          const SizedBox(height: 10),
          const Text('Penormalan bertahap', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.neutral500)),
          for (final t in tahap)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text('Tahap ${teksGgn(t['tahap'])}${ada(t['jam']) ? ' · ${teksGgn(t['jam'])}' : ''}'
                  '${ada(t['gardu']) ? ' · ${teksGgn(t['gardu'])} gardu' : ''}${ada(t['pelanggan']) ? ' · ${teksGgn(t['pelanggan'])} pelanggan' : ''}'
                  '${ada(t['daerah']) ? '\n${teksGgn(t['daerah'])}' : ''}',
                  style: const TextStyle(fontSize: 13, color: AppColors.neutral900)),
            ),
        ],
        if (jenis == 'pickup')
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final (k, l) in _fotoPickup)
              if (teksGgn(o[k]).startsWith('https://'))
                OutlinedButton.icon(onPressed: () => unawaited(_bukaUrl(c, teksGgn(o[k]))), icon: const Icon(Icons.photo_outlined, size: 18), label: Text('Foto $l')),
          ]),
        if (RegExp(r'^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$').hasMatch(koord)) ...[
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () => unawaited(_bukaUrl(c, 'https://www.google.com/maps?q=${Uri.encodeComponent(koord)}')),
            icon: const Icon(Icons.place_outlined, size: 18),
            label: const Text('Buka lokasi di peta'),
          ),
        ],
      ]),
    ),
  );
}

/// Lembar rincian satu penyulang Top 12: jumlah PMT | Section, padam / ENS, Kode FGTM, daftar kejadian (ketuk = detail).
Future<void> bukaRincianGgn(BuildContext context, {required List<Map<String, dynamic>> baris, required String jenis, required String penyulang, required int tahun, required String hariIni}) {
  final j = jenisGgn(jenis);
  final p = rentangTahunGgn(tahun, hariIni);
  final isi = saringGgn(baris, jenis, penyulang: penyulang, dari: p.dari, sampai: p.sampai);
  final h = hitungKategoriGgn(isi, jenis);
  final pd = ringkasPadamGgn(isi);
  final fgtm = pieFgtm(isi);
  Widget kpi(String l, String v, {Widget? bawah}) => Expanded(
        child: Container(
          margin: const EdgeInsets.only(right: 8),
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(color: AppColors.neutral50, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.neutral150)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(l, style: const TextStyle(fontSize: 11, color: AppColors.neutral500)),
            Text(v, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: AppColors.brand950)),
            if (bawah != null) bawah,
          ]),
        ),
      );
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (c) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: .85,
      maxChildSize: .95,
      builder: (c, gulir) => ListView(controller: gulir, padding: const EdgeInsets.fromLTRB(20, 0, 20, 24), children: [
        Text(penyulang, style: HartekGaya.judulSeksi),
        Text('${j.label} · ${tglIdGgn(p.dari)} – ${tglIdGgn(p.sampai)}', style: HartekGaya.sekunder),
        const SizedBox(height: 12),
        Row(children: [
          kpi('Kejadian', '${h.jumlah}',
              bawah: Text('PMT ${h.pmt} · Section ${h.section}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.neutral700))),
          if (jenis == 'penyulang') kpi('Total padam', teksDurasiGgn(pd.durasi)),
          if (jenis == 'penyulang') kpi('ENS', '${_angka(pd.ensKwh)} kWh'),
        ]),
        if (jenis != 'pickup' && fgtm.isNotEmpty) ...[
          const SizedBox(height: 14),
          const Text('Kode FGTM', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.neutral500)),
          for (final f in fgtm)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Row(children: [
                Expanded(flex: 5, child: Text('${f.kode.isEmpty ? '' : '${f.kode} · '}${f.label}', style: const TextStyle(fontSize: 12.5), overflow: TextOverflow.ellipsis)),
                Expanded(
                  flex: 4,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(99),
                    child: LinearProgressIndicator(value: f.jumlah / fgtm.first.jumlah, minHeight: 8, color: warnaJenisGgn(jenis), backgroundColor: AppColors.neutral100),
                  ),
                ),
                SizedBox(width: 30, child: Text('${f.jumlah}', textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w800))),
              ]),
            ),
        ],
        const SizedBox(height: 14),
        const Text('Kejadian', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.neutral500)),
        const SizedBox(height: 6),
        for (final o in isi) KartuKejadianGgn(o: o, jenis: jenis, onTap: () => unawaited(bukaDetailGgn(c, o, jenis))),
      ]),
    ),
  );
}
