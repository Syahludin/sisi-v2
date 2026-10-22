import 'package:flutter/material.dart';

import '../../theme/app_colors.dart';
import '../../widgets/kartu_laporan_tim.dart';
import 'hartek_form.dart' show angkaDari;
import 'hartek_gaya.dart';
import 'hartek_lokal.dart';

/// v0.93.1: rincian Hartek dipisah dari HartekScreen supaya bisa diuji tanpa server (temuan review: layar rincian
/// v0.93.0 belum punya test). Status buka-tutup dipegang pemanggil ([terbuka] + [onBukaTutup]) supaya tidak hilang
/// saat laporan dimuat ulang sesudah simpan.
///
/// Isi: per jenis (Jaringan / Gardu / Non-Teknik) kartu buka-tutup > lokasi > pekerjaan > material pekerjaan itu,
/// dengan + Material di tiap pekerjaan dan + Pekerjaan di tiap lokasi.

const urutJenisHartek = ['Jaringan', 'Gardu', 'Non - Teknik'];

String teksHartek(Object? v) => v?.toString().trim() ?? '';

List<Map<String, dynamic>> mapsHartek(Object? v) => v is List<dynamic>
    ? v.whereType<Map<dynamic, dynamic>>().map((m) => Map<String, dynamic>.from(m)).toList()
    : <Map<String, dynamic>>[];

/// Nama lokasi PG: Jaringan = `penyulang · section`, lainnya = `Gardu <no>`.
String lokasiHartek(Map<String, dynamic> pg) => pg['jenisPekerjaan'] == 'Jaringan'
    ? [teksHartek(pg['penyulang']), teksHartek(pg['section'])].where((s) => s.isNotEmpty).join(' · ')
    : 'Gardu ${teksHartek(pg['noGardu'])}';

/// Total material satu laporan: dijumlahkan per (material, satuan), urut nama.
List<(String, String)> rekapMaterialHartek(List<Map<String, dynamic>> objek) {
  final total = <String, num>{};
  final label = <String, String>{};
  for (final pg in objek) {
    for (final pk in mapsHartek(pg['pekerjaan'])) {
      for (final m in mapsHartek(pk['material'])) {
        final nama = teksHartek(m['material']), satuan = teksHartek(m['satuan']);
        final kunci = '${nama.toLowerCase()}|${satuan.toLowerCase()}';
        total[kunci] = (total[kunci] ?? 0) + (angkaDari(teksHartek(m['jumlah'])) ?? 0);
        label[kunci] = nama;
        label['$kunci#s'] = satuan;
      }
    }
  }
  final kunci = total.keys.toList()..sort((a, b) => label[a]!.compareTo(label[b]!));
  return [for (final k in kunci) (label[k]!, '${angkaHartek(total[k]!)} ${label['$k#s']}'.trim())];
}

/// Hasil pekerjaan sebagai teks: '3 buah'. Kosong kalau jumlah & satuan kosong.
String hasilHartek(Map<String, dynamic> pk) =>
    '${teksHartek(pk['jumlahPekerjaan'])} ${teksHartek(pk['satuanPekerjaan'])}'.trim();

/// Angka Romawi untuk penomoran lokasi PG pada teks WA (I, II, III, ...).
String _romawiHartek(int n) {
  if (n <= 0) return '$n';
  const pasang = [
    (1000, 'M'), (900, 'CM'), (500, 'D'), (400, 'CD'),
    (100, 'C'), (90, 'XC'), (50, 'L'), (40, 'XL'),
    (10, 'X'), (9, 'IX'), (5, 'V'), (4, 'IV'), (1, 'I'),
  ];
  var sisa = n;
  final buf = StringBuffer();
  for (final p in pasang) {
    while (sisa >= p.$1) {
      buf.write(p.$2);
      sisa -= p.$1;
    }
  }
  return buf.toString();
}

/// Satuan untuk WA: huruf awal kapital bila masih huruf kecil semua ('buah' -> 'Buah', 'mm²' tetap 'mm²').
String _satuanWaHartek(Object? v) {
  final s = teksHartek(v);
  if (s.isEmpty) return '';
  if (s.length == 1) return s;
  return s == s.toLowerCase() ? '${s[0].toUpperCase()}${s.substring(1)}' : s;
}

/// Jumlah + satuan untuk WA: '54 Buah'.
String _jumlahSatuanWaHartek(Object? jml, Object? sat) {
  final n = angkaDari(teksHartek(jml));
  final j = n != null ? angkaHartek(n) : teksHartek(jml);
  final s = _satuanWaHartek(sat);
  return '$j $s'.trim();
}

/// v0.97.3 (kvlar 15 Okt 2026): teks pelaporan Hartek untuk WhatsApp sesuai format baku ULP Toboali.
/// Urutan seksi: Pekerjaan Gardu, Pekerjaan Jaringan, Pekerjaan Non-Teknik (tiap seksi selalu tampil; kosong = Nihil).
String waTeksHartek({
  String kodeHeader = '',
  required String tanggal,
  String tim = '',
  String ulp = 'Toboali',
  required Map<String, dynamic> header,
  required List<Map<String, dynamic>> objek,
}) {
  String strip(Object? v) => teksHartek(v).isEmpty ? '-' : teksHartek(v);
  final namaUlp = ulp.trim().isEmpty ? 'Toboali' : ulp.trim();
  final daerahUnik = <String>[];
  for (final pg in objek) {
    final d = teksHartek(pg['daerah']);
    if (d.isNotEmpty && !daerahUnik.any((x) => x.toLowerCase() == d.toLowerCase())) {
      daerahUnik.add(d);
    }
  }
  final b = <String>[
    '*Realisasi Pekerjaan Hartek ULP $namaUlp*',
    '',
    'Hari, Tanggal : ${tanggal.isEmpty ? '-' : tanggalHartek(tanggal)}',
    'Koordinat Awal Pekerjaan : ${strip(header['koordinatAwal'])}',
    'Koordinat Akhir Pekerjaan : ${strip(header['koordinatAkhir'])}',
    'Lokasi Pekerjaan : ${daerahUnik.isEmpty ? '-' : daerahUnik.join(', ')}',
  ];
  const seksi = [
    ('Gardu', '*Pekerjaan Gardu :*'),
    ('Jaringan', '*Pekerjaan Jaringan :*'),
    ('Non - Teknik', '*Pekerjaan Non-Teknik :*'),
  ];
  for (final s in seksi) {
    b.add('');
    b.add(s.$2);
    final lokasi = objek.where((pg) => teksHartek(pg['jenisPekerjaan']) == s.$1).toList();
    if (lokasi.isEmpty) {
      b.add('Nihil');
      continue;
    }
    for (var i = 0; i < lokasi.length; i++) {
      final pg = lokasi[i];
      final rom = _romawiHartek(i + 1);
      if (s.$1 == 'Jaringan') {
        b.add('$rom. Penyulang : *${strip(pg['penyulang'])}*');
        b.add('Section : ${strip(pg['section'])}');
      } else {
        b.add('$rom. Gardu : *${strip(pg['noGardu'])}*');
        b.add('Penyulang : ${strip(pg['penyulang'])}');
        b.add('Section : ${strip(pg['section'])}');
      }
      final jobs = mapsHartek(pg['pekerjaan']);
      b.add('Pekerjaan :');
      if (jobs.isEmpty) {
        b.add('-');
        continue;
      }
      for (var j = 0; j < jobs.length; j++) {
        final pk = jobs[j];
        final hasil = _jumlahSatuanWaHartek(pk['jumlahPekerjaan'], pk['satuanPekerjaan']);
        b.add('${j + 1}. ${teksHartek(pk['pekerjaan'])}${hasil.isEmpty ? '' : ' : $hasil'}');
        final mat = mapsHartek(pk['material']);
        if (mat.isNotEmpty) {
          b.add('- Material :');
          for (final m in mat) {
            final jm = _jumlahSatuanWaHartek(m['jumlah'], m['satuan']);
            final milik = teksHartek(m['kepemilikan']);
            final ekor = [if (jm.isNotEmpty) jm, if (milik.isNotEmpty) '($milik)'].join(' ');
            b.add('> ${teksHartek(m['material'])}${ekor.isEmpty ? '' : ' : $ekor'}');
          }
        }
        for (final g in mapsHartek(pk['grounding'])) {
          final seb = teksHartek(g['hasilSebelum']), ses = teksHartek(g['hasilSesudah']);
          b.add('- Grounding ${teksHartek(g['jenisPeralatan'])} : '
              '${seb.isEmpty ? '' : '$seb -> '}${ses.isEmpty ? '-' : ses} Ohm');
        }
        final pmList = mapsHartek(pk['pemerataan']);
        for (final x in pmList) {
          String amp(String k) {
            final v = teksHartek(x[k]);
            if (v.isEmpty) return '-';
            return RegExp(r'a$', caseSensitive: false).hasMatch(v)
                ? v.replaceFirst(RegExp(r'\s+a$', caseSensitive: false), 'A')
                : '${v}A';
          }
          final sebR = teksHartek(x['sebR']), sebS = teksHartek(x['sebS']), sebT = teksHartek(x['sebT']);
          final sesR = teksHartek(x['sesR']), sesS = teksHartek(x['sesS']), sesT = teksHartek(x['sesT']);
          if (sebR.isEmpty && sebS.isEmpty && sebT.isEmpty && sesR.isEmpty && sesS.isEmpty && sesT.isEmpty) continue;
          final gar = teksHartek(x['noGardu']);
          if (pmList.length > 1 && gar.isNotEmpty) b.add('Gardu $gar:');
          const kHdr = 'Beban Sebelum';
          final kR = 'R : ${amp('sebR')}';
          final kS = 'S : ${amp('sebS')}';
          final kT = 'T : ${amp('sebT')}';
          final lebarKiri = [kHdr.length, kR.length, kS.length, kT.length].reduce((a, c) => a > c ? a : c) + 2;
          b.add('${kHdr.padRight(lebarKiri)}Beban Sesudah');
          b.add('${kR.padRight(lebarKiri)}R : ${amp('sesR')}');
          b.add('${kS.padRight(lebarKiri)}S : ${amp('sesS')}');
          b.add('${kT.padRight(lebarKiri)}T : ${amp('sesT')}');
        }
      }
    }
  }
  return b.join('\n');
}

/// Jenis yang terbuka saat rincian pertama kali tampil: hanya satu jenis = langsung terbuka.
Set<String> jenisAwalTerbukaHartek(List<Map<String, dynamic>> objek) {
  final ada = urutJenisHartek.where((j) => objek.any((pg) => teksHartek(pg['jenisPekerjaan']) == j)).toList();
  return ada.length == 1 ? {ada.first} : <String>{};
}

/// v0.96.0: ikon indikator kirim ke server (seperti P0 & ROW): cloud hijau saat terkirim, cloud upload saat menunggu,
/// seru merah saat ditolak.
class IkonCloudHartek extends StatelessWidget {
  const IkonCloudHartek({super.key, required this.node, this.ukuran = 16});

  final Map<String, dynamic> node;
  final double ukuran;

  @override
  Widget build(BuildContext context) {
    final s = node[HartekLokal.sinkron];
    if (s == HartekLokal.gagal) {
      return Icon(Icons.error_outline_rounded, size: ukuran, color: AppColors.red600, semanticLabel: 'Ditolak server');
    }
    if (s == HartekLokal.lokal) {
      return Icon(Icons.cloud_upload_outlined, size: ukuran, color: AppColors.accent700, semanticLabel: 'Menunggu kirim');
    }
    return Icon(Icons.cloud_done_rounded, size: ukuran, color: AppColors.success700, semanticLabel: 'Terkirim ke server');
  }
}

/// v0.95.0: tanda data yang belum diterima server. LOKAL = baris kecil "Menunggu kirim" (tanpa chip);
/// GAGAL = kotak merah berisi alasan server + Coba lagi / Buang. Node bersih = tidak tampil apa pun.
class TandaSinkronHartek extends StatelessWidget {
  const TandaSinkronHartek({super.key, required this.node, this.onCobaUlang, this.onBuang, this.ubahHeader = false, this.padding});

  final Map<String, dynamic> node;
  final VoidCallback? onCobaUlang, onBuang;

  /// Tanda perubahan Laporan Utama (`_ubah`), bukan pembuatan.
  final bool ubahHeader;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    final status = node[ubahHeader ? HartekLokal.ubah : HartekLokal.sinkron];
    if (status == null) return const SizedBox.shrink();
    final isi = status == HartekLokal.gagal
        ? Container(
            padding: const EdgeInsets.fromLTRB(12, 10, 6, 4),
            decoration: BoxDecoration(color: AppColors.red100, borderRadius: BorderRadius.circular(12)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Icon(Icons.error_outline_rounded, size: 18, color: AppColors.red700),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                      '${ubahHeader ? 'Perubahan ditolak server' : 'Ditolak server'}: '
                      '${teksHartek(node[ubahHeader ? HartekLokal.galatUbah : HartekLokal.galat])}',
                      style: const TextStyle(fontSize: 13.5, height: 1.35, color: AppColors.red700)),
                ),
              ]),
              Wrap(alignment: WrapAlignment.end, children: [
                if (onBuang != null)
                  TextButton(
                    onPressed: onBuang,
                    style: TextButton.styleFrom(foregroundColor: AppColors.red700, visualDensity: VisualDensity.compact),
                    child: Text(ubahHeader ? 'Batalkan perubahan' : 'Buang'),
                  ),
                if (onCobaUlang != null)
                  TextButton(
                    onPressed: onCobaUlang,
                    style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
                    child: const Text('Coba lagi'),
                  ),
              ]),
            ]),
          )
        : const Row(children: [
            Icon(Icons.cloud_upload_outlined, size: 15, color: AppColors.accent700),
            SizedBox(width: 6),
            Text('Menunggu kirim', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.accent700)),
          ]);
    return Padding(padding: padding ?? const EdgeInsets.only(top: 6), child: isi);
  }
}

class RincianHartek extends StatelessWidget {
  const RincianHartek({
    super.key,
    required this.objek,
    required this.kodeHeader,
    required this.terbuka,
    required this.onBukaTutup,
    required this.onBukaLokasi,
    required this.onBukaPekerjaan,
    required this.onTambahLokasi,
    required this.onTambahPekerjaan,
    required this.onTambahMaterial,
    this.boleh = true,
    this.sibuk = false,
    this.onCobaUlang,
    this.onBuang,
    this.jenis,
    this.onUbahPekerjaan,
    this.onCobaUlangUbah,
    this.onBuangUbah,
    this.lokasiTertutup = const <String>{},
    this.onBukaTutupLokasi,
    this.perLokasi = false,
  });

  /// v1.0.20 (permintaan kvlar 23 Okt 2026): halaman utama laporan Hartek (pola ROW): satu kartu per lokasi
  /// (penyulang / gardu / non-teknik), di dalamnya rincian pekerjaan, di dalam pekerjaan material yang dipakai.
  /// Tanpa kepala rincian / kartu jenis.
  final bool perLokasi;

  final List<Map<String, dynamic>> objek;
  final String kodeHeader;
  final Set<String> terbuka;
  final void Function(String jenis) onBukaTutup;
  final void Function(String pgId) onBukaLokasi;
  final void Function(String pgId, String pekerjaanId) onBukaPekerjaan;
  final VoidCallback onTambahLokasi;
  final void Function(Map<String, dynamic> pg) onTambahPekerjaan;
  final void Function(Map<String, dynamic> pk) onTambahMaterial;
  final bool boleh, sibuk;

  /// v0.95.0: data ditolak server (ID node).
  final void Function(String id)? onCobaUlang, onBuang;

  /// v0.97.0: rincian dibatasi satu jenis pekerjaan (dari ketukan angka di kartu laporan). null = semua jenis.
  final String? jenis;

  /// v0.97.0 / v0.97.4: ubah pekerjaan & jumlah pekerjaan yang sudah diisi. null = tidak boleh ubah.
  final void Function(Map<String, dynamic> pg, Map<String, dynamic> pk)? onUbahPekerjaan;

  /// v0.97.0: perubahan jumlah pekerjaan yang ditolak server (ID pekerjaan).
  final void Function(String pekerjaanId)? onCobaUlangUbah, onBuangUbah;

  /// v0.97.4: ID lokasi PG (penyulang / gardu) yang sedang dilipat (minimize). Default kosong = semua lokasi terbuka.
  final Set<String> lokasiTertutup;
  final void Function(String pgId)? onBukaTutupLokasi;

  Widget _tanda(Map<String, dynamic> n, String id, {EdgeInsetsGeometry? padding}) => TandaSinkronHartek(
        node: n,
        padding: padding,
        onCobaUlang: onCobaUlang == null || sibuk ? null : () => onCobaUlang!(id),
        onBuang: onBuang == null || sibuk ? null : () => onBuang!(id),
      );

  List<Map<String, dynamic>> _lokasiJenis(String jenis) =>
      objek.where((pg) => teksHartek(pg['jenisPekerjaan']) == jenis).toList();

  int _pekerjaanJenis(String jenis) => _lokasiJenis(jenis).fold<int>(0, (a, pg) => a + mapsHartek(pg['pekerjaan']).length);

  int get _jumlahPekerjaan => objek.fold<int>(0, (a, pg) => a + mapsHartek(pg['pekerjaan']).length);

  int get _jumlahMaterial => objek.fold<int>(
      0, (a, pg) => a + mapsHartek(pg['pekerjaan']).fold<int>(0, (b, pk) => b + mapsHartek(pk['material']).length));

  static const _urutJenis = urutJenisHartek;

  Widget _judulSeksi(String judul, {String? info}) => Padding(
        padding: const EdgeInsets.only(top: 28, bottom: 12),
        child: Row(children: [
          Expanded(child: Text(judul, style: HartekGaya.judulSeksi)),
          if (info != null) Text(info, style: HartekGaya.sekunder),
        ]),
      );

  Widget _aksiUtama(String label, VoidCallback aksi) => Padding(
        padding: const EdgeInsets.only(top: 6, bottom: 4),
        child: FilledButton.icon(
          key: const ValueKey('tambah-lokasi'),   // v0.95.0: label "Tambah Pekerjaan" (dulu Tambah lokasi PG)
          onPressed: sibuk || !boleh ? null : aksi,
          style: FilledButton.styleFrom(
            minimumSize: const Size.fromHeight(54),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          ),
          icon: const Icon(Icons.add_rounded, size: 20),
          label: Text(label),
        ),
      );

  // v0.93.0: satu rincian. Ketuk jenis pekerjaan = buka daftar lokasi + pekerjaan; tiap pekerjaan memuat
  // materialnya sendiri dan tombol tambah material, jadi terbaca material dipakai di pekerjaan apa.

  int _materialJenis(String jenis) => _lokasiJenis(jenis)
      .fold<int>(0, (a, pg) => a + mapsHartek(pg['pekerjaan']).fold<int>(0, (b, pk) => b + mapsHartek(pk['material']).length));


  String _hasilPekerjaan(Map<String, dynamic> pk) => hasilHartek(pk);

  /// Tanda PERUBAHAN jumlah pekerjaan yang belum terkirim / ditolak (node tetap milik server).
  Widget _tandaUbah(Map<String, dynamic> pk) {
    final id = teksHartek(pk['pekerjaanId']);
    return TandaSinkronHartek(
      node: pk,
      ubahHeader: true,
      onCobaUlang: onCobaUlangUbah == null || sibuk ? null : () => onCobaUlangUbah!(id),
      onBuang: onBuangUbah == null || sibuk ? null : () => onBuangUbah!(id),
    );
  }

  // v0.95.0 (permintaan kvlar 14 Okt 2026): rincian lebih mudah dibaca. Lokasi = judul berikon (bukan teks tautan),
  // rincian pekerjaan bernomor, material berlabel di bawah pekerjaannya, jumlah rata kanan.

  Widget _materialRincian(Map<String, dynamic> m) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Text(teksHartek(m['material']),
                  style: const TextStyle(fontSize: 14.5, height: 1.3, color: HartekGaya.tinta)),
            ),
            const SizedBox(width: 8),
            Padding(
              padding: const EdgeInsets.only(right: 4, top: 2),
              child: IkonCloudHartek(node: m, ukuran: 14),
            ),
            Text('${teksHartek(m['jumlah'])} ${teksHartek(m['satuan'])}'.trim(),
                style: const TextStyle(
                    fontSize: 14.5, fontWeight: FontWeight.w800, color: HartekGaya.tinta, fontFeatures: HartekGaya.tabular)),
          ]),
          if (m[HartekLokal.sinkron] == HartekLokal.gagal) _tanda(m, teksHartek(m['idBaris'])),
        ]),
      );

  Widget _nomor(int n, JenisPg j) => Container(
        width: 26,
        height: 26,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: j.latar, shape: BoxShape.circle),
        child: Text('$n', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: j.warna)),
      );

  /// Satu rincian pekerjaan: nomor + nama + hasil (dengan background melingkar warna jenis), lalu blok MATERIAL miliknya.
  Widget _pekerjaanRincian(Map<String, dynamic> pg, Map<String, dynamic> pk, int no, JenisPg j) {
    final mat = mapsHartek(pk['material']);
    final gr = mapsHartek(pk['grounding']).length, pm = mapsHartek(pk['pemerataan']).length;
    final hasil = _hasilPekerjaan(pk);
    final lain = [
      if (gr > 0) '$gr grounding',
      if (pm > 0) '$pm pemerataan',
    ].join(' · ');
    return Padding(
      key: ValueKey('pekerjaan-${teksHartek(pk['pekerjaanId'])}'),
      padding: const EdgeInsets.only(top: 10),
      child: Material(
        color: AppColors.surface,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: HartekGaya.garis)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          InkWell(
            onTap: sibuk ? null : () => onBukaPekerjaan(teksHartek(pg['pgId']), teksHartek(pk['pekerjaanId'])),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 4, 12),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                _nomor(no, j),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(teksHartek(pk['pekerjaan']),
                        style: const TextStyle(fontSize: 15.5, height: 1.3, fontWeight: FontWeight.w700, color: HartekGaya.tinta)),
                    if (hasil.isNotEmpty) ...[
                      const SizedBox(height: 5),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                          decoration: BoxDecoration(color: j.latar, borderRadius: BorderRadius.circular(999)),
                          child: Text(hasil,
                              style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w800,
                                  color: j.warna,
                                  fontFeatures: HartekGaya.tabular)),
                        ),
                      ),
                    ],
                    if (lain.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(lain, style: const TextStyle(fontSize: 12.5, color: HartekGaya.redup)),
                    ],
                    _tanda(pk, teksHartek(pk['pekerjaanId'])),
                    _tandaUbah(pk),
                  ]),
                ),
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: IkonCloudHartek(node: pk, ukuran: 15),
                ),
                // v0.97.0 / v0.97.4: ubah pekerjaan dan jumlah yang sudah diisi
                if (onUbahPekerjaan != null)
                  IconButton(
                    key: ValueKey('ubah-pekerjaan-${teksHartek(pk['pekerjaanId'])}'),
                    tooltip: 'Ubah pekerjaan',
                    visualDensity: VisualDensity.compact,
                    padding: const EdgeInsets.all(4),
                    constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                    onPressed: sibuk ? null : () => onUbahPekerjaan!(pg, pk),
                    icon: const Icon(Icons.edit_outlined, size: 17, color: HartekGaya.redup),
                  )
                else
                  const Padding(
                    padding: EdgeInsets.only(top: 2),
                    child: Icon(Icons.chevron_right_rounded, size: 20, color: AppColors.neutral400),
                  ),
              ]),
            ),
          ),
          Container(
            padding: const EdgeInsets.fromLTRB(34, 8, 12, 4),
            decoration: const BoxDecoration(
              color: AppColors.neutral50,
              border: Border(top: BorderSide(color: HartekGaya.garis)),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text(mat.isEmpty ? 'MATERIAL' : 'MATERIAL · ${mat.length}',
                  style: const TextStyle(fontSize: 11.5, letterSpacing: .6, fontWeight: FontWeight.w700, color: HartekGaya.redup)),
              if (mat.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 6),
                  child: Text('Belum ada material', style: TextStyle(fontSize: 13.5, color: HartekGaya.redup)),
                ),
              for (var n = 0; n < mat.length; n++) ...[
                if (n > 0) const Divider(height: 1, color: HartekGaya.garis),
                _materialRincian(mat[n]),
              ],
              if (boleh)
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    key: ValueKey('tambah-material-${teksHartek(pk['pekerjaanId'])}'),
                    onPressed: sibuk ? null : () => onTambahMaterial(pk),
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      visualDensity: VisualDensity.compact,
                      textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
                    ),
                    icon: const Icon(Icons.add_rounded, size: 18),
                    label: const Text('Material'),
                  ),
                ),
            ]),
          ),
        ]),
      ),
    );
  }

  /// Satu lokasi dalam jenis: judul lokasi berikon (ketuk = halaman lokasi), tombol lipat (expand/minimize),
  /// rincian pekerjaannya, dan tombol tambah rincian.
  Widget _lokasiRincian(Map<String, dynamic> pg, JenisPg j, bool pertama) {
    final pgId = teksHartek(pg['pgId']);
    final buka = !lokasiTertutup.contains(pgId);
    final jobs = mapsHartek(pg['pekerjaan']);
    final sub = [
      if (teksHartek(pg['daerah']).isNotEmpty) teksHartek(pg['daerah']),
      if (teksHartek(pg['jumlahGawang']).isNotEmpty) '${teksHartek(pg['jumlahGawang'])} gawang',
    ].join(' · ');
    return Container(
      padding: const EdgeInsets.only(top: 14, bottom: 4),
      decoration: pertama ? null : const BoxDecoration(border: Border(top: BorderSide(color: HartekGaya.garis))),
      margin: EdgeInsets.only(top: pertama ? 0 : 10),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(
            child: InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: sibuk ? null : () => onBukaLokasi(pgId),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(children: [
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(color: j.latar, borderRadius: BorderRadius.circular(10)),
                    child: Icon(Icons.place_outlined, size: 19, color: j.warna),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Flexible(
                          child: Text(lokasiHartek(pg),
                              style: const TextStyle(fontSize: 15, height: 1.3, fontWeight: FontWeight.w800, color: HartekGaya.tinta)),
                        ),
                        const SizedBox(width: 6),
                        IkonCloudHartek(node: pg, ukuran: 15),
                      ]),
                      if (sub.isNotEmpty) Text(sub, style: const TextStyle(fontSize: 12.5, color: HartekGaya.redup)),
                    ]),
                  ),
                  if (jobs.isNotEmpty) ...[
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(color: j.latar, borderRadius: BorderRadius.circular(999)),
                      child: Text('${jobs.length}',
                          style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w800,
                              color: j.warna,
                              fontFeatures: HartekGaya.tabular)),
                    ),
                  ],
                ]),
              ),
            ),
          ),
          if (onBukaTutupLokasi != null)
            IconButton(
              key: ValueKey('lipat-lokasi-$pgId'),
              tooltip: buka ? 'Sembunyikan rincian' : 'Tampilkan rincian',
              visualDensity: VisualDensity.compact,
              padding: const EdgeInsets.all(4),
              constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
              onPressed: () => onBukaTutupLokasi!(pgId),
              icon: AnimatedRotation(
                turns: buka ? .5 : 0,
                duration: const Duration(milliseconds: 200),
                child: const Icon(Icons.expand_more_rounded, size: 22, color: HartekGaya.redup),
              ),
            )
          else
            const Icon(Icons.chevron_right_rounded, size: 20, color: AppColors.neutral400),
        ]),
        _tanda(pg, pgId),
        ClipRect(
          child: AnimatedSize(
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOut,
            alignment: Alignment.topCenter,
            child: !buka
                ? const SizedBox(width: double.infinity)
                : Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    if (jobs.isEmpty)
                      Container(
                        margin: const EdgeInsets.only(top: 8),
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        decoration: BoxDecoration(color: AppColors.neutral100, borderRadius: BorderRadius.circular(14)),
                        child: const Text('Belum ada rincian pekerjaan di lokasi ini.',
                            style: TextStyle(fontSize: 13.5, color: HartekGaya.redup)),
                      ),
                    for (var n = 0; n < jobs.length; n++) _pekerjaanRincian(pg, jobs[n], n + 1, j),
                    if (boleh)
                      Padding(
                        padding: const EdgeInsets.only(top: 10),
                        child: OutlinedButton.icon(
                          key: ValueKey('tambah-pekerjaan-$pgId'),
                          onPressed: sibuk ? null : () => onTambahPekerjaan(pg),
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size.fromHeight(44),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            side: const BorderSide(color: HartekGaya.garis),
                            textStyle: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700),
                          ),
                          icon: const Icon(Icons.add_rounded, size: 18),
                          label: const Text('Tambah Rincian Pekerjaan'),
                        ),
                      ),
                  ]),
          ),
        ),
      ]),
    );
  }

  Widget _ikonJenis(List<Map<String, dynamic>> lokasi) {
    var adaGagal = false, adaLokal = false;
    void cek(Map<String, dynamic> n) {
      if (n[HartekLokal.sinkron] == HartekLokal.gagal) adaGagal = true;
      if (n[HartekLokal.sinkron] == HartekLokal.lokal) adaLokal = true;
    }

    for (final pg in lokasi) {
      cek(pg);
      for (final pk in mapsHartek(pg['pekerjaan'])) {
        cek(pk);
        for (final k in HartekLokal.anakPekerjaan.keys) {
          mapsHartek(pk[k]).forEach(cek);
        }
      }
    }
    if (adaGagal) return const Icon(Icons.error_outline_rounded, size: 18, color: AppColors.red600);
    if (adaLokal) return const Icon(Icons.cloud_upload_outlined, size: 18, color: AppColors.accent700);
    return const Icon(Icons.cloud_done_rounded, size: 18, color: AppColors.success700);
  }

  /// Satu jenis pekerjaan (Jaringan / Gardu / Non - Teknik) sebagai kartu yang bisa dibuka-tutup.
  Widget _jenisRincian(String jenis) {
    final j = JenisPg.dari(jenis);
    final lokasi = _lokasiJenis(jenis);
    final buka = terbuka.contains(jenis);
    final nama = jenis == 'Non - Teknik' ? 'Non-Teknik' : jenis;
    return KartuHartek(
      margin: const EdgeInsets.only(top: 12),
      padding: EdgeInsets.zero,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Semantics(
          button: true,
          expanded: buka,
          child: InkWell(
            key: ValueKey('jenis-$jenis'),
            onTap: () => onBukaTutup(jenis),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
              child: Row(children: [
                KotakIkon(j, ukuran: 46),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Flexible(
                        child: Text(nama, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: HartekGaya.tinta)),
                      ),
                      const SizedBox(width: 6),
                      _ikonJenis(lokasi),
                    ]),
                    const SizedBox(height: 2),
                    Text('${lokasi.length} lokasi · ${_pekerjaanJenis(jenis)} pekerjaan · ${_materialJenis(jenis)} material',
                        style: const TextStyle(fontSize: 13, color: HartekGaya.redup)),
                  ]),
                ),
                Container(
                  constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: j.latar, borderRadius: BorderRadius.circular(999)),
                  child: Text('${_pekerjaanJenis(jenis)}',
                      style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w900,
                          color: j.warna,
                          fontFeatures: HartekGaya.tabular)),
                ),
                const SizedBox(width: 6),
                AnimatedRotation(
                  turns: buka ? .5 : 0,
                  duration: const Duration(milliseconds: 200),
                  child: const Icon(Icons.expand_more_rounded, color: HartekGaya.redup),
                ),
              ]),
            ),
          ),
        ),
        ClipRect(
          child: AnimatedSize(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOut,
            alignment: Alignment.topCenter,
            child: !buka
                ? const SizedBox(width: double.infinity)
                : Container(
                    padding: const EdgeInsets.fromLTRB(14, 0, 14, 16),
                    decoration: const BoxDecoration(border: Border(top: BorderSide(color: HartekGaya.garis))),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      for (var n = 0; n < lokasi.length; n++) _lokasiRincian(lokasi[n], j, n == 0),
                    ]),
                  ),
          ),
        ),
      ]),
    );
  }

  /// v0.97.0 (kvlar 15 Okt 2026): kepala rincian dirancang ulang. Satu kartu putih, satu garis aksen, kode laporan
  /// monospace, judul besar, lalu satu baris angka. Tenang, mudah dibaca, tanpa warna mewah di mana-mana.
  Widget _kepala() {
    final satu = jenis;
    final nama = satu == null ? null : (satu == 'Non - Teknik' ? 'Non-Teknik' : satu);
    return KartuHartek(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 4,
            height: 14,
            decoration: BoxDecoration(color: HartekGaya.merek, borderRadius: BorderRadius.circular(4)),
          ),
          const SizedBox(width: 8),
          Expanded(child: Text(kodeHeader, maxLines: 1, overflow: TextOverflow.ellipsis, style: HartekGaya.kode)),
        ]),
        const SizedBox(height: 10),
        Text(nama == null ? 'Rincian pekerjaan' : 'Pekerjaan $nama',
            style: HartekGaya.judulBesar.copyWith(fontSize: 23)),
        const SizedBox(height: 6),
        Text('${objek.length} lokasi · $_jumlahPekerjaan pekerjaan · $_jumlahMaterial material', style: HartekGaya.sekunder),
      ]),
    );
  }

  Widget _totalMaterial(List<(String, String)> rekap) => KartuHartek(
        padding: const EdgeInsets.fromLTRB(18, 2, 18, 2),
        child: Column(children: [
          for (var n = 0; n < rekap.length; n++) ...[
            if (n > 0) const Divider(height: 1, color: HartekGaya.garis),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 13),
              child: Row(children: [
                Expanded(
                  child: Text(rekap[n].$1,
                      style: const TextStyle(fontSize: 15, height: 1.3, fontWeight: FontWeight.w600, color: HartekGaya.tinta)),
                ),
                const SizedBox(width: 12),
                Text(rekap[n].$2,
                    style: const TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w800, color: HartekGaya.merek, fontFeatures: HartekGaya.tabular)),
              ]),
            ),
          ],
        ]),
      );

  /// v1.0.20: kartu lokasi berdiri sendiri (halaman utama laporan).
  List<Widget> _isiPerLokasi() {
    final rekap = rekapMaterialHartek(objek);
    return [
      for (final j in _urutJenis)
        for (final pg in _lokasiJenis(j))
          KartuHartek(
            key: ValueKey('lokasi-${teksHartek(pg['pgId'])}'),
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
            child: _lokasiRincian(pg, JenisPg.dari(j), true),
          ),
      if (rekap.isNotEmpty) ...[
        _judulSeksi('Total material', info: '${rekap.length} jenis'),
        _totalMaterial(rekap),
      ],
    ];
  }

  List<Widget> _isi() {
    if (perLokasi) return _isiPerLokasi();
    final rekap = rekapMaterialHartek(objek);
    final jenisAda = _urutJenis.where((j) => _lokasiJenis(j).isNotEmpty).toList();
    return [
      const SizedBox(height: 4),
      _kepala(),
      if (jenis == null) ...[
        const SizedBox(height: 12),
        PanelAngkaRingkas(
          angka: [
            for (final j in _urutJenis) AngkaRingkas(j == 'Non - Teknik' ? 'Non-Teknik' : j, _pekerjaanJenis(j)),
            AngkaRingkas('Total Pekerjaan', _jumlahPekerjaan),
          ],
        ),
      ],
      if (jenisAda.isEmpty) ...[
        const SizedBox(height: 16),
        const KosongHartek(
            ikon: Icons.place_outlined, judul: 'Belum ada lokasi', petunjuk: 'Ketuk Tambah Pekerjaan untuk mencatat jaringan, gardu, atau non-teknik.'),
      ] else ...[
        const SizedBox(height: 12),
        const Text('Ketuk jenis pekerjaan untuk melihat rincian pekerjaan dan material yang dipakai.',
            style: TextStyle(fontSize: 13, color: HartekGaya.redup)),
      ],
      for (final j in jenisAda) _jenisRincian(j),
      if (rekap.isNotEmpty) ...[
        _judulSeksi('Total material', info: '${rekap.length} jenis'),
        _totalMaterial(rekap),
      ],
      const SizedBox(height: 18),
      _aksiUtama('Tambah Pekerjaan', onTambahLokasi),
    ];
  }

  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: _isi());
}
